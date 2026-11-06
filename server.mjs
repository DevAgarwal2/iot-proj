import nextEnv from "@next/env";
import { createServer } from "node:http";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";

const { loadEnvConfig } = nextEnv;

// Load .env / .env.local before the WebSocket proxy reads GNANI_API_KEY.
loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const GNANI_URL =
  process.env.GNANI_STT_WS_URL || "wss://api.vachana.ai/stt/v3/stream";
const FRAME_BYTES = 1024; // 512 samples × 2 bytes (32 ms at 16 kHz)
const FRAME_MS = 32;
const ROTATE_MS = 14 * 60 * 1000; // Gnani caps a session at 15 minutes
const MAX_QUEUED_SECONDS = 120;

function gnaniHeaders() {
  const configured = process.env.GNANI_LANGUAGE || "en-IN,hi-IN";
  const codes = configured
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  return {
    "x-api-key-id": process.env.GNANI_API_KEY || "",
    language_code: codes.length > 1 ? codes[0] : configured,
    ...(codes.length > 1 ? { multi_lang_codes: codes.join(",") } : {}),
    model: process.env.GNANI_MODEL || "prisma-v3.0",
    "x-sample-rate": "16000",
    "x-idle-timeout-sec": "900",
    "x-vad-threshold": "0.5",
    "x-min-silence-ms": "700",
    "x-max-speech-s": "8",
  };
}

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (browser) => {
  let upstream = null;
  let queue = Buffer.alloc(0);
  let closing = false;
  let startedAt = 0;
  let reconnectAttempts = 0;
  let doneTimer = null;
  let commitRequested = false;
  let commitSent = false;

  const sendJson = (payload) => {
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(JSON.stringify(payload));
    }
  };

  const flushAndCommit = () => {
    if (commitSent || !upstream || upstream.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (queue.length > 0) {
      const padded = Buffer.alloc(FRAME_BYTES);
      queue.copy(padded, 0, 0, Math.min(queue.length, FRAME_BYTES));
      queue = Buffer.alloc(0);
      upstream.send(padded);
    }

    upstream.send(JSON.stringify({ type: "commit" }));
    commitSent = true;
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => sendJson({ type: "done" }), 3000);
    return true;
  };

  const connectUpstream = () => {
    if (closing) return;

    const socket = new WebSocket(GNANI_URL, {
      headers: gnaniHeaders(),
      handshakeTimeout: 10000,
    });
    upstream = socket;

    socket.on("open", () => {
      startedAt = Date.now();
      reconnectAttempts = 0;
      console.log("[stt] Gnani session connected");
    });

    socket.on("message", (data, isBinary) => {
      if (browser.readyState !== WebSocket.OPEN) return;
      browser.send(isBinary ? data : data.toString());
    });

    socket.on("error", (error) => {
      console.error("[stt] Gnani socket error:", error.message);
      sendJson({
        type: "error",
        message: `Live transcription connection error: ${error.message}`,
      });
    });

    socket.on("close", (code) => {
      upstream = null;
      console.log(`[stt] Gnani session closed (${code})`);
      if (closing) return;

      if (commitSent) {
        clearTimeout(doneTimer);
        sendJson({ type: "done" });
        return;
      }

      if (browser.readyState !== WebSocket.OPEN) return;

      reconnectAttempts += 1;
      if (reconnectAttempts > 5) {
        sendJson({
          type: "error",
          message:
            "Live transcription stopped. The recording will be transcribed when you stop.",
        });
        return;
      }

      setTimeout(connectUpstream, Math.min(1000 * reconnectAttempts, 3000));
    });
  };

  // Send 1024-byte PCM frames at Gnani's required real-time cadence.
  const pacer = setInterval(() => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return;

    // If audio backed up (e.g. after a reconnect), catch up faster.
    const frames = queue.length > FRAME_BYTES * 32 ? 8 : 1;
    for (let i = 0; i < frames && queue.length >= FRAME_BYTES; i += 1) {
      const frame = Buffer.from(queue.subarray(0, FRAME_BYTES));
      queue = queue.subarray(FRAME_BYTES);
      try {
        upstream.send(frame);
      } catch {
        break;
      }
    }

    // Commit only once all queued audio has been sent.
    if (commitRequested && !commitSent && queue.length < FRAME_BYTES) {
      flushAndCommit();
    }
  }, FRAME_MS);

  // Force a reconnect before Gnani's 15-minute session limit.
  const rotator = setInterval(() => {
    if (upstream && Date.now() - startedAt > ROTATE_MS) {
      try {
        upstream.close(1000, "rotate");
      } catch {
        // ignore
      }
    }
  }, 5000);

  browser.on("message", (data, isBinary) => {
    if (!isBinary) {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message?.type === "commit") {
        commitRequested = true;
        if (queue.length < FRAME_BYTES) {
          flushAndCommit();
        }
      }
      return;
    }

    queue = Buffer.concat([queue, data]);

    const maxBytes = 16000 * 2 * MAX_QUEUED_SECONDS;
    if (queue.length > maxBytes) {
      queue = queue.subarray(queue.length - maxBytes);
    }
  });

  browser.on("close", () => {
    closing = true;
    clearInterval(pacer);
    clearInterval(rotator);
    clearTimeout(doneTimer);

    if (upstream?.readyState === WebSocket.OPEN) {
      try {
        upstream.send(JSON.stringify({ type: "commit" }));
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          upstream?.close();
        } catch {
          // ignore
        }
      }, 150);
    }
  });

  connectUpstream();
});

const server = createServer((request, response) => handle(request, response));

server.on("upgrade", (request, socket, head) => {
  let pathname;
  try {
    pathname = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`
    ).pathname;
  } catch {
    return;
  }

  if (pathname !== "/api/stt/stream") {
    // Let Next.js handle its own upgrade requests (e.g. HMR).
    return;
  }

  if (!process.env.GNANI_API_KEY) {
    socket.write(
      "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
    );
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(port, hostname, () => {
  console.log(
    `> Lecture Notes ready on http://${hostname}:${port} (${dev ? "dev" : "production"})`
  );
});
