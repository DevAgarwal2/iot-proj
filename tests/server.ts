import { spawn } from "node:child_process";
import path from "node:path";

export interface TestServer {
  url: string;
  stop: () => Promise<void>;
}

const projectRoot = path.resolve(import.meta.dir, "..");
const PORT = 3210;

/**
 * Boots the real Next.js dev server and waits until it answers.
 * Tests then talk to the actual HTTP API - no route handlers are imported
 * directly, so the full Next request pipeline (env loading, validation,
 * Prisma, Mistral) is exercised.
 */
export async function startServer(port: number): Promise<TestServer> {
  const child = spawn("bun", ["run", "dev"], {
    cwd: projectRoot,
    // NODE_ENV must not be "test", otherwise Next.js skips `.env.local`.
    env: { ...process.env, PORT: String(port), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group so we can kill `next-server` grandchildren too.
    detached: true,
  });

  let logs = "";
  child.stdout?.on("data", (chunk) => (logs += chunk.toString()));
  child.stderr?.on("data", (chunk) => (logs += chunk.toString()));

  const killGroup = (signal: NodeJS.Signals) => {
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // fall through to the single-process kill
      }
    }
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  };
  process.once("exit", () => killGroup("SIGKILL"));
  process.once("SIGINT", () => {
    killGroup("SIGKILL");
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    killGroup("SIGKILL");
    process.exit(143);
  });

  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming ready:\n${logs}`);
    }
    try {
      await fetch(url, { redirect: "manual" });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  if (Date.now() >= deadline) {
    killGroup("SIGKILL");
    throw new Error(`Server did not become ready in time:\n${logs}`);
  }

  return {
    url,
    stop: async () => {
      if (child.exitCode !== null) return;
      killGroup("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          killGroup("SIGKILL");
          resolve();
        }, 5000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

/**
 * Shared, process-wide server. Test files run concurrently in the same
 * process, so they all reuse this single instance. `releaseServer()` is
 * refcounted so the server only stops once every suite is done.
 */
let refCount = 0;

export function getServer(): Promise<TestServer> {
  const store = globalThis as { __TEST_SERVER__?: Promise<TestServer> };
  if (!store.__TEST_SERVER__) {
    store.__TEST_SERVER__ = startServer(PORT);
  }
  refCount += 1;
  return store.__TEST_SERVER__;
}

export async function releaseServer(): Promise<void> {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;

  // Debounce: another suite may call getServer() momentarily.
  await new Promise((resolve) => setTimeout(resolve, 750));
  if (refCount > 0) return;

  const store = globalThis as { __TEST_SERVER__?: Promise<TestServer> };
  const server = await store.__TEST_SERVER__;
  store.__TEST_SERVER__ = undefined;
  await server?.stop();
}

export const SPEECH_FIXTURE = path.join(
  projectRoot,
  "tests",
  "fixtures",
  "speech.wav"
);

/** Extract raw PCM bytes from a canonical 44-byte-header WAV file. */
export function wavToPcm(wav: Buffer): Buffer {
  const dataIndex = wav.indexOf("data", 0, "ascii");
  if (dataIndex === -1) throw new Error("Invalid WAV: no data chunk");
  return wav.subarray(dataIndex + 8);
}
