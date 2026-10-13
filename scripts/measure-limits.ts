/**
 * Measures Mistral Voxtral transcription limits for this account.
 *
 * Usage:
 *   bun run scripts/measure-limits.ts offline --durations 1,5,15,30
 *   bun run scripts/measure-limits.ts realtime --seconds 300
 *
 * "offline" pushes progressively longer audio through the batch transcription
 * endpoint and reports, per request, the audio minutes, latency, tokens and
 * whether a 429 (rate/quota limit) was hit, plus the cumulative minutes.
 *
 * "realtime" streams audio to the live endpoint at real-time pace and reports
 * how long the session keeps producing text before it stops/closes.
 */
import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.MISTRAL_API_KEY;
if (!API_KEY) {
  console.error("MISTRAL_API_KEY is not set (put it in .env.local)");
  process.exit(1);
}

const SAMPLE_RATE = 16000;
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "speech.wav");

const args = process.argv.slice(2);
const mode = args[0] ?? "offline";

function argValue(name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function loadFixturePcm(): Buffer {
  const wav = fs.readFileSync(FIXTURE);
  const index = wav.indexOf("data", 0, "ascii");
  if (index === -1) throw new Error("fixture is not a valid WAV");
  return wav.subarray(index + 8);
}

function buildPcm(minutes: number, seed: Buffer): Buffer {
  const target = Math.round(minutes * 60 * SAMPLE_RATE * 2);
  const out = Buffer.allocUnsafe(target);
  for (let offset = 0; offset < target; offset += seed.length) {
    seed.copy(out, offset, 0, Math.min(seed.length, target - offset));
  }
  return out;
}

interface OfflineResult {
  ok: boolean;
  status: number;
  audioMinutes: number;
  latencySeconds: number;
  textLength: number;
  totalTokens?: number;
  retryAfter: string | null;
  error?: string;
}

async function transcribeOffline(pcmWav: Buffer): Promise<OfflineResult> {
  const form = new FormData();
  form.append("model", "voxtral-mini-latest");
  form.append(
    "file",
    new Blob([new Uint8Array(pcmWav)], { type: "audio/wav" }),
    "measure.wav"
  );

  const started = Date.now();
  const response = await fetch(
    "https://api.mistral.ai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    }
  );
  const latencySeconds = (Date.now() - started) / 1000;
  const retryAfter = response.headers.get("retry-after");

  if (!response.ok) {
    let error = "";
    try {
      error = JSON.stringify(await response.json()).slice(0, 200);
    } catch {
      // ignore
    }
    return {
      ok: false,
      status: response.status,
      audioMinutes: 0,
      latencySeconds,
      textLength: 0,
      retryAfter,
      error,
    };
  }

  const json = await response.json();
  const audioSeconds = json.usage?.prompt_audio_seconds ?? 0;
  return {
    ok: true,
    status: response.status,
    audioMinutes: audioSeconds / 60,
    latencySeconds,
    textLength: json.text?.length ?? 0,
    totalTokens: json.usage?.total_tokens ?? 0,
    retryAfter,
  };
}

async function runOffline() {
  const durations = argValue("--durations", "1,5,15,30")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => value > 0);

  const seed = loadFixturePcm();
  let cumulativeMinutes = 0;

  console.log(
    `Offline transcription probe — durations (min): ${durations.join(", ")}\n`
  );
  console.log(
    "  req-min   status   latency    audio-min   tokens   cumulative-min   text"
  );

  for (const minutes of durations) {
    const wav = pcmToWav(buildPcm(minutes, seed));
    const sizeMb = (wav.length / (1024 * 1024)).toFixed(1);

    let result: OfflineResult;
    try {
      result = await transcribeOffline(wav);
    } catch (error) {
      result = {
        ok: false,
        status: 0,
        audioMinutes: 0,
        latencySeconds: 0,
        textLength: 0,
        retryAfter: null,
        error: String(error),
      };
    }

    cumulativeMinutes += result.audioMinutes;

    if (result.ok) {
      console.log(
        `  ${String(minutes).padStart(5)}m   ${result.status}      ` +
          `${result.latencySeconds.toFixed(1).padStart(6)}s    ` +
          `${result.audioMinutes.toFixed(2).padStart(8)}    ` +
          `${String(result.totalTokens).padStart(6)}   ` +
          `${cumulativeMinutes.toFixed(2).padStart(13)}   ` +
          `${result.textLength} chars (${sizeMb} MB)`
      );
    } else {
      console.log(
        `  ${String(minutes).padStart(5)}m   ${result.status}      ` +
          `${result.latencySeconds.toFixed(1).padStart(6)}s    ` +
          `${"FAIL".padStart(8)}    ${"".padStart(6)}   ` +
          `${cumulativeMinutes.toFixed(2).padStart(13)}   ` +
          `${result.error ?? ""}`
      );
      if (result.status === 429) {
        console.log(
          `\n  >>> RATE/QUOTA LIMIT HIT at ~${cumulativeMinutes.toFixed(1)} ` +
            `audio-minutes (retry-after: ${result.retryAfter ?? "n/a"})`
        );
        break;
      }
      if (result.status === 413 || result.status === 422) {
        console.log(
          `\n  >>> request rejected at ${minutes} min (size/format limit)`
        );
      }
    }
  }

  console.log(
    `\nTotal audio processed this run: ${cumulativeMinutes.toFixed(1)} minutes.`
  );
}

interface RealtimeArgs {
  seconds: number;
}

async function runRealtime() {
  const { seconds } = parseRealtimeArgs();

  const sessionResponse = await fetch(
    "https://api.mistral.ai/v1/client/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        purpose: "realtime",
        model: "voxtral-mini-transcribe-realtime-2602",
      }),
    }
  );
  const { client_secret } = await sessionResponse.json();
  const token = client_secret.value;

  const pcm = buildPcm(seconds / 60, loadFixturePcm());
  const bytesPerFrame = (SAMPLE_RATE * 2 * 100) / 1000; // 100ms

  const socket = new WebSocket(
    "wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-2602",
    ["realtime", token]
  );

  const startedAt = Date.now();
  let lastTextAt = 0;
  let deltaCount = 0;
  let finished = false;

  console.log(
    `Realtime probe — streaming ${seconds}s of audio at real-time pace...\n`
  );

  await new Promise<void>((resolve) => {
    socket.addEventListener("open", async () => {
      socket.send(
        JSON.stringify({
          type: "session.update",
          session: {
            audio_format: { encoding: "pcm_s16le", sample_rate: SAMPLE_RATE },
          },
        })
      );

      for (let i = 0; i < pcm.length; i += bytesPerFrame) {
        if (socket.readyState !== WebSocket.OPEN) break;
        socket.send(
          JSON.stringify({
            type: "input_audio.append",
            audio: pcm.subarray(i, i + bytesPerFrame).toString("base64"),
          })
        );
        await new Promise((r) => setTimeout(r, 100));
      }
      socket.send(JSON.stringify({ type: "input_audio.flush" }));
      socket.send(JSON.stringify({ type: "input_audio.end" }));
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data));
      if (data.type === "transcription.text.delta" && data.text) {
        deltaCount += 1;
        lastTextAt = Date.now();
        if (deltaCount % 100 === 0) {
          console.log(
            `  ${((Date.now() - startedAt) / 1000).toFixed(0)}s: ` +
              `${deltaCount} deltas, still transcribing`
          );
        }
      }
      if (data.type === "transcription.done") {
        finished = true;
        console.log(
          `\n  done after ${((Date.now() - startedAt) / 1000).toFixed(0)}s, ` +
            `${deltaCount} deltas`
        );
        socket.close();
      }
      if (data.type === "error") {
        console.log("\n  server error:", JSON.stringify(data).slice(0, 200));
        socket.close();
      }
    });

    socket.addEventListener("close", (event) => {
      console.log(`  socket closed (code ${event.code})`);
      resolve();
    });
    socket.addEventListener("error", () => {
      console.log("  socket error");
      resolve();
    });
  });

  const totalSeconds = (Date.now() - startedAt) / 1000;
  console.log(
    `\nStreamed for ${totalSeconds.toFixed(0)}s. deltas=${deltaCount}, ` +
      `last text ${((Date.now() - lastTextAt) / 1000).toFixed(0)}s ago, ` +
      `session ${finished ? "completed" : "ended without done"}.`
  );
}

function parseRealtimeArgs(): RealtimeArgs {
  return { seconds: Number(argValue("--seconds", "300")) };
}

if (mode === "realtime") {
  await runRealtime();
} else {
  await runOffline();
}
