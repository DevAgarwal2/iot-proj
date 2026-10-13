import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "bun:test";
import fs from "node:fs";
import {
  getServer,
  releaseServer,
  wavToPcm,
  SPEECH_FIXTURE,
  type TestServer,
} from "./server";

let server: TestServer;
let base: string;
const createdRecordings: string[] = [];

const fixtureWav = fs.readFileSync(SPEECH_FIXTURE);

beforeAll(async () => {
  server = await getServer();
  base = server.url;
}, 90_000);

afterAll(async () => {
  for (const id of createdRecordings) {
    try {
      await fetch(`${base}/api/recordings/${id}`, { method: "DELETE" });
    } catch {
      // best-effort cleanup
    }
  }
  await releaseServer();
});

async function createRecording(title = `TEST ${Date.now()}`): Promise<string> {
  const response = await fetch(`${base}/api/recordings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  expect(response.status).toBe(201);
  const recording = await response.json();
  createdRecordings.push(recording.id);
  return recording.id;
}

async function postDiarize(id: string, wav: Buffer, filename = "speech.wav") {
  const form = new FormData();
  form.append("audio", new Blob([wav], { type: "audio/wav" }), filename);
  return fetch(`${base}/api/recordings/${id}/diarize`, {
    method: "POST",
    body: form,
  });
}

// ---------------------------------------------------------------------------
// Realtime session
// ---------------------------------------------------------------------------
describe("API: /api/realtime/session", () => {
  it("mints a scoped short-lived realtime token", async () => {
    const response = await fetch(`${base}/api/realtime/session`, {
      method: "POST",
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.token).toMatch(/^rt_/);
    expect(body.model).toBe("voxtral-mini-transcribe-realtime-2602");
    expect(body.url).toBe("wss://api.mistral.ai/v1/audio/transcriptions/realtime");
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  }, 30_000);

  it("rejects the wrong HTTP method", async () => {
    const response = await fetch(`${base}/api/realtime/session`);
    expect(response.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Recordings CRUD
// ---------------------------------------------------------------------------
describe("API: recordings CRUD", () => {
  it("creates, reads, updates and deletes a recording", async () => {
    const id = await createRecording("TEST crud lifecycle");

    const getResponse = await fetch(`${base}/api/recordings/${id}`);
    expect(getResponse.status).toBe(200);
    const fetched = await getResponse.json();
    expect(fetched.id).toBe(id);
    expect(fetched.title).toBe("TEST crud lifecycle");
    expect(fetched.status).toBe("recording");
    expect(Array.isArray(fetched.segments)).toBe(true);
    expect(Array.isArray(fetched.speakers)).toBe(true);

    const patchResponse = await fetch(`${base}/api/recordings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration: 42, status: "completed" }),
    });
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.duration).toBe(42);
    expect(patched.status).toBe("completed");

    const deleteResponse = await fetch(`${base}/api/recordings/${id}`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(200);
    expect((await deleteResponse.json()).success).toBe(true);

    const afterDelete = await fetch(`${base}/api/recordings/${id}`);
    expect(afterDelete.status).toBe(404);
  }, 30_000);

  it("returns 404 for an unknown recording", async () => {
    const response = await fetch(`${base}/api/recordings/does-not-exist`);
    expect(response.status).toBe(404);
  });

  it("lists recordings", async () => {
    const response = await fetch(`${base}/api/recordings`);
    expect(response.status).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  });

  it("groups recordings by date", async () => {
    const id = await createRecording("TEST by-date");
    const response = await fetch(`${base}/api/recordings/by-date`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("grouped");
    expect(body).toHaveProperty("dates");
    expect(Array.isArray(body.dates)).toBe(true);

    const dayKey = new Date().toISOString().split("T")[0];
    expect(body.grouped[dayKey]?.some((r: { id: string }) => r.id === id)).toBe(
      true
    );
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Segments & speakers
// ---------------------------------------------------------------------------
describe("API: segments and speakers", () => {
  it("rejects an empty segments payload", async () => {
    const id = await createRecording("TEST segments validation");
    const response = await fetch(`${base}/api/recordings/${id}/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: [] }),
    });
    expect(response.status).toBe(400);
  });

  it("creates segments and attaches a speaker", async () => {
    const id = await createRecording("TEST segments");

    const speakerResponse = await fetch(
      `${base}/api/recordings/${id}/speakers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakers: [{ label: "speaker_1", name: "Professor" }],
        }),
      }
    );
    expect(speakerResponse.status).toBe(201);
    const speakers = await speakerResponse.json();
    expect(speakers[0].label).toBe("speaker_1");

    const segmentsResponse = await fetch(
      `${base}/api/recordings/${id}/segments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: [
            {
              text: "Hello world",
              timestamp: new Date().toISOString(),
              startTime: 0,
              endTime: 2,
              speakerId: speakers[0].id,
            },
          ],
        }),
      }
    );
    expect(segmentsResponse.status).toBe(201);
    expect((await segmentsResponse.json()).count).toBe(1);
  }, 30_000);

  it("returns 404 when adding segments to an unknown recording", async () => {
    const response = await fetch(`${base}/api/recordings/nope/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: [{ text: "x", timestamp: new Date() }] }),
    });
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Diarization (live Mistral call)
// ---------------------------------------------------------------------------
describe("API: /api/recordings/[id]/diarize", () => {
  it("requires an audio file", async () => {
    const id = await createRecording("TEST diarize validation");
    const response = await fetch(`${base}/api/recordings/${id}/diarize`, {
      method: "POST",
      body: new FormData(),
    });
    expect(response.status).toBe(400);
  }, 30_000);

  it("returns 404 for an unknown recording", async () => {
    const response = await postDiarize("does-not-exist", fixtureWav);
    expect(response.status).toBe(404);
  }, 30_000);

  it("transcribes with speaker diarization and replaces live segments", async () => {
    const id = await createRecording("TEST diarize happy path");

    // Seed a placeholder live segment that must be replaced.
    await fetch(`${base}/api/recordings/${id}/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segments: [
          {
            text: "PLACEHOLDER LIVE SEGMENT",
            timestamp: new Date().toISOString(),
            startTime: 0,
            endTime: 1,
          },
        ],
      }),
    });

    const response = await postDiarize(id, fixtureWav);
    expect(response.status).toBe(200);

    const recording = await response.json();
    expect(recording.status).toBe("completed");
    expect(recording.segments.length).toBeGreaterThan(0);
    expect(recording.speakers.length).toBeGreaterThanOrEqual(1);

    const joined = recording.segments
      .map((s: { text: string }) => s.text)
      .join(" ")
      .toLowerCase();
    expect(joined).not.toContain("placeholder live segment");
    expect(joined).toContain("fox");

    for (const segment of recording.segments) {
      expect(typeof segment.text).toBe("string");
      expect(segment.text.trim().length).toBeGreaterThan(0);
      expect(typeof segment.startTime).toBe("number");
      expect(segment.startTime).toBeLessThanOrEqual(segment.endTime);
      expect(segment.speaker).toBeTruthy();
      expect(typeof segment.speaker.name).toBe("string");
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Insights (live Mistral call)
// ---------------------------------------------------------------------------
describe("API: insights", () => {
  const transcript =
    "Today's lecture covered neural networks and backpropagation. " +
    "We discussed gradient descent and how loss functions guide training. " +
    "Validation sets help prevent overfitting.";

  it("validates the generate payload", async () => {
    const id = await createRecording("TEST insights validation");
    const response = await fetch(
      `${base}/api/recordings/${id}/insights/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(response.status).toBe(400);
  }, 30_000);

  it("streams structured insights as JSON text", async () => {
    const id = await createRecording("TEST insights generate");
    const response = await fetch(
      `${base}/api/recordings/${id}/insights/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");

    const text = await response.text();
    const match = text.match(/\{[\s\S]*\}/);
    expect(match).not.toBeNull();

    const parsed = JSON.parse(match![0]);
    expect(typeof parsed.summary).toBe("string");
    expect(parsed.summary.length).toBeGreaterThan(10);
    expect(Array.isArray(parsed.keyPoints)).toBe(true);
    expect(parsed.keyPoints.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.topics)).toBe(true);
    expect(parsed.topics.length).toBeGreaterThan(0);
  }, 120_000);

  it("saves and fetches insights", async () => {
    const id = await createRecording("TEST insights persistence");

    const saveResponse = await fetch(
      `${base}/api/recordings/${id}/insights`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "A concise summary.",
          keyPoints: ["point one", "point two"],
          topics: ["topic"],
          wordCount: 17,
        }),
      }
    );
    expect(saveResponse.status).toBe(200);
    const saved = await saveResponse.json();
    expect(saved.keyPoints).toEqual(["point one", "point two"]);
    expect(saved.topics).toEqual(["topic"]);

    const getResponse = await fetch(`${base}/api/recordings/${id}/insights`);
    expect(getResponse.status).toBe(200);
    const fetched = await getResponse.json();
    expect(fetched.summary).toBe("A concise summary.");
    expect(fetched.wordCount).toBe(17);
  }, 30_000);

  it("returns 404 for missing insights", async () => {
    const id = await createRecording("TEST insights missing");
    const response = await fetch(`${base}/api/recordings/${id}/insights`);
    expect(response.status).toBe(404);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// End words (settings)
// ---------------------------------------------------------------------------
async function addEndWord(word: string) {
  const response = await fetch(`${base}/api/settings/end-words`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function deleteEndWord(id: string) {
  await fetch(`${base}/api/settings/end-words?id=${id}`, { method: "DELETE" });
}

describe("API: /api/settings/end-words", () => {
  it("lists end words", async () => {
    const response = await fetch(`${base}/api/settings/end-words`);
    expect(response.status).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  });

  it("normalizes, stores, rejects blanks and upserts duplicates", async () => {
    const created = await addEndWord("  Done  ");
    expect(created.response.status).toBe(201);
    expect(created.body.word).toBe("done");

    const duplicate = await addEndWord("done");
    expect(duplicate.body.id).toBe(created.body.id);

    const blank = await addEndWord("   ");
    expect(blank.response.status).toBe(400);

    await deleteEndWord(created.body.id);
  });

  it("requires an id to delete", async () => {
    const response = await fetch(`${base}/api/settings/end-words`, {
      method: "DELETE",
    });
    expect(response.status).toBe(400);
  });

  it("deletes an end word", async () => {
    const created = await addEndWord("tmpdelete");
    const del = await fetch(
      `${base}/api/settings/end-words?id=${created.body.id}`,
      { method: "DELETE" }
    );
    expect(del.status).toBe(200);

    const list = await fetch(`${base}/api/settings/end-words`).then((r) =>
      r.json()
    );
    expect(
      list.some((entry: { word: string }) => entry.word === "tmpdelete")
    ).toBe(false);
  });
});

describe("API: end-word transcript grouping", () => {
  it("splits the final transcript on configured end words (diarization)", async () => {
    // The fixture says: "The quick brown fox ... over the lazy dog. Machine
    // learning models learn patterns from data."
    const { body: endWord } = await addEndWord("dog");

    try {
      const id = await createRecording("TEST end-word grouping");
      const response = await postDiarize(id, fixtureWav);
      expect(response.status).toBe(200);

      const recording = await response.json();
      const texts = recording.segments.map((segment: { text: string }) =>
        segment.text.toLowerCase()
      );
      const joined = texts.join(" ");

      expect(texts.length).toBeGreaterThanOrEqual(2);
      expect(joined).toContain("dog"); // end word is kept in the line
      expect(joined).toContain("lazy");
      expect(joined).toContain("machine learning");
      expect(texts.some((text: string) => text.includes("fox"))).toBe(true);
      expect(
        texts.some((text: string) => text.trim().endsWith("dog"))
      ).toBe(true);
    } finally {
      await deleteEndWord(endWord.id);
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Realtime WebSocket protocol (live Mistral call)
// ---------------------------------------------------------------------------
describe("Realtime WebSocket transcription", () => {
  it("transcribes streamed PCM audio and finishes cleanly", async () => {
    const sessionResponse = await fetch(`${base}/api/realtime/session`, {
      method: "POST",
    });
    const { token, model, url } = await sessionResponse.json();

    const pcm = wavToPcm(fixtureWav);
    const transcript = await transcribeOverWebSocket({ token, model, url, pcm });

    expect(transcript.toLowerCase()).toContain("fox");
    expect(transcript.toLowerCase()).toContain("learning");
    expect(transcript.length).toBeGreaterThan(30);
  }, 120_000);
});

interface RealtimeArgs {
  token: string;
  model: string;
  url: string;
  pcm: Buffer;
}

function transcribeOverWebSocket({
  token,
  model,
  url,
  pcm,
}: RealtimeArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${url}?model=${encodeURIComponent(model)}`,
      ["realtime", token]
    );

    let streamedText = "";
    let settled = false;

    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    const timeout = setTimeout(
      () => fail(new Error("Realtime transcription timed out")),
      90_000
    );

    socket.addEventListener("open", async () => {
      socket.send(
        JSON.stringify({
          type: "session.update",
          session: {
            audio_format: { encoding: "pcm_s16le", sample_rate: 16000 },
          },
        })
      );

      const bytesPerChunk = (16000 * 2 * 120) / 1000; // 120ms frames
      for (let i = 0; i < pcm.length; i += bytesPerChunk) {
        socket.send(
          JSON.stringify({
            type: "input_audio.append",
            audio: pcm.subarray(i, i + bytesPerChunk).toString("base64"),
          })
        );
        await new Promise((r) => setTimeout(r, 40));
      }

      socket.send(JSON.stringify({ type: "input_audio.flush" }));
      socket.send(JSON.stringify({ type: "input_audio.end" }));
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data));
      if (
        (data.type === "transcription.text.delta" ||
          (!data.type && typeof data.text === "string")) &&
        typeof data.text === "string"
      ) {
        streamedText += data.text;
      }

      const isDone =
        data.type === "transcription.done" ||
        (typeof data.text === "string" && Boolean(data.usage));
      if (isDone) {
        finish(typeof data.text === "string" ? data.text : streamedText);
      }

      if (data.type === "error") {
        fail(new Error(data.error?.message ?? "Realtime transcription error"));
      }
    });

    socket.addEventListener("error", () =>
      fail(new Error("WebSocket connection error"))
    );
    socket.addEventListener("close", () => {
      if (!settled) finish(streamedText);
    });
  });
}
