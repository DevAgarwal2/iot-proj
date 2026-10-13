import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import {
  getServer,
  releaseServer,
  SPEECH_FIXTURE,
  type TestServer,
} from "./server";

let server: TestServer;
let base: string;
let browser: Browser;
let page: Page;
let createdRecordingId: string | null = null;
let testEndWordId: string | null = null;

beforeAll(async () => {
  server = await getServer();
  base = server.url;

  // The fixture says "... the lazy dog ...", so configuring "dog" as an end
  // word makes the live transcript deterministic regardless of any end words
  // already configured in the database.
  const endWordResponse = await fetch(`${base}/api/settings/end-words`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word: "dog" }),
  });
  if (endWordResponse.ok) {
    testEndWordId = (await endWordResponse.json()).id;
  }

  browser = await chromium.launch({
    channel: "chromium",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${SPEECH_FIXTURE}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const context = await browser.newContext();
  await context.grantPermissions(["microphone"], { origin: base });
  page = await context.newPage();
}, 120_000);

afterAll(async () => {
  if (createdRecordingId) {
    try {
      await fetch(`${base}/api/recordings/${createdRecordingId}`, {
        method: "DELETE",
      });
    } catch {
      // best-effort cleanup
    }
  }
  if (testEndWordId) {
    try {
      await fetch(`${base}/api/settings/end-words?id=${testEndWordId}`, {
        method: "DELETE",
      });
    } catch {
      // best-effort cleanup
    }
  }
  await browser?.close();
  await releaseServer();
});

interface RecordingResponse {
  id: string;
  status: string;
  segments: Array<{ text: string }>;
  speakers: Array<{ id: string; name: string | null; label: string }>;
  insights: { summary: string } | null;
}

async function waitForRecording(
  id: string,
  predicate: (recording: RecordingResponse) => boolean,
  timeoutMs = 90_000
): Promise<RecordingResponse> {
  const deadline = Date.now() + timeoutMs;
  let last: RecordingResponse = {
    id,
    status: "unknown",
    segments: [],
    speakers: [],
    insights: null,
  };

  while (Date.now() < deadline) {
    last = await fetch(`${base}/api/recordings/${id}`).then((r) => r.json());
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return last;
}

describe("E2E: record -> live transcript -> diarize -> insights", () => {
  it("records the fake microphone and produces a speaker-labelled transcript", async () => {
    const title = `E2E Lecture ${Date.now()}`;

    await page.goto(`${base}/dashboard/record`);
    await page.waitForSelector("button svg.lucide-mic", { timeout: 30_000 });

    // Open the title input and start recording.
    await page.click("button:has(svg.lucide-mic)");
    await page.fill(
      'input[placeholder="Lecture title (optional)"]',
      title
    );
    await page.getByRole("button", { name: "Start Recording" }).click();

    // The microphone stream is live once the stop button appears.
    await page.waitForSelector("button:has(svg.lucide-square)", {
      timeout: 30_000,
    });

    // Live transcription should produce at least one segment within ~20s.
    await page.waitForSelector("text=Live Transcript", { timeout: 30_000 });

    // Capture several seconds of (looped) speech.
    await page.waitForTimeout(12_000);

    await page.click("button:has(svg.lucide-square)");

    // Processing runs diarization + insights, then navigates to the transcript.
    await page.waitForURL(/\/dashboard\/transcript\?id=/, {
      timeout: 180_000,
    });

    const recordingId = new URL(page.url()).searchParams.get("id");
    expect(recordingId).toBeTruthy();
    createdRecordingId = recordingId;

    // The diarization + insights pipeline should have persisted results.
    const recording = await waitForRecording(
      recordingId!,
      (r) => r.status === "completed" && (r.segments?.length ?? 0) > 0
    );

    const joined = (recording.segments ?? [])
      .map((segment: { text: string }) => segment.text)
      .join(" ")
      .toLowerCase();

    expect(joined).toContain("fox");
    expect(recording.speakers.length).toBeGreaterThanOrEqual(1);
    expect(recording.insights).toBeTruthy();
    expect((recording.insights?.summary ?? "").length).toBeGreaterThan(10);

    // The transcript page itself should render the speaker-labelled segments.
    await page.waitForSelector("text=Speakers", { timeout: 60_000 });
    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText.toLowerCase()).toContain("fox");
  }, 300_000);
});
