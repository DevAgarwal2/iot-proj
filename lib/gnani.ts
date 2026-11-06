/**
 * Gnani (Vachana) speech-to-text client.
 *
 * Batch transcription is used for the final transcript: it supports long audio
 * (up to 4 hours), automatic language detection and speaker diarization.
 *
 * Docs: https://docs.gnani.ai/api/STTBatch/Introduction
 */

export const GNANI_BASE_URL =
  process.env.GNANI_BASE_URL ?? "https://api.vachana.ai";
export const GNANI_MODEL = process.env.GNANI_MODEL ?? "prisma-v3.0";
export const GNANI_LANGUAGE =
  process.env.GNANI_LANGUAGE ?? "en-IN,hi-IN";

export const GNANI_STT_WS_URL =
  process.env.GNANI_STT_WS_URL ?? "wss://api.vachana.ai/stt/v3/stream";

/** Direct uploads are capped at 10 MB; larger files use a presigned upload. */
const MAX_DIRECT_UPLOAD_BYTES = 10 * 1024 * 1024;
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "PARTIAL_FAILURE",
  "FAILED",
  "START_FAILED",
  "CANCELLED",
]);

export interface GnaniSegment {
  text: string;
  start: number;
  end: number;
  speakerId: string | null;
}

export interface GnaniTranscript {
  text: string;
  language: string;
  segments: GnaniSegment[];
}

interface BatchJob {
  job_id: string;
  status: string;
}

interface BatchFile {
  status: string;
  transcript_url?: string | null;
  error_message?: string | null;
}

interface TranscriptDocument {
  full_transcript?: string;
  language_code?: string;
  detected_language_code?: string;
  segments?: Array<{
    text?: string;
    start_time?: number;
    end_time?: number;
    speaker_id?: number | null;
    language_detected?: string | null;
  }>;
}

function apiKey(): string {
  const key = process.env.GNANI_API_KEY;
  if (!key) {
    throw new Error("GNANI_API_KEY is not set");
  }
  return key;
}

const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);

async function gnaniFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  let delay = 500;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`${GNANI_BASE_URL}${path}`, {
      ...init,
      headers: {
        "X-API-Key-ID": apiKey(),
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) {
      return response;
    }

    const body = await response.text().catch(() => "");

    if (!RETRYABLE_STATUSES.has(response.status) || attempt === 4) {
      throw new Error(
        `Gnani request failed (${response.status} ${path}): ${body.slice(0, 300)}`
      );
    }

    const retryAfter = response.headers.get("retry-after");
    const wait =
      retryAfter && /^\d+$/.test(retryAfter)
        ? Math.max(delay, Number(retryAfter) * 1000)
        : delay;

    console.warn(
      `[gnani] ${response.status} on ${path}; retrying in ${wait}ms (attempt ${attempt}/4)`
    );
    await new Promise((resolve) => setTimeout(resolve, wait));
    delay = Math.min(delay * 2, 8000);
  }

  throw new Error("Gnani request failed after retries");
}

function batchConfig() {
  return {
    model: GNANI_MODEL,
    language_code: GNANI_LANGUAGE,
    mode: "transcribe",
    with_diarization: true,
    num_speakers: 8,
    ...(GNANI_MODEL === "prisma-v3.0" ? { format: "transcribe" } : {}),
  };
}

async function createDirectJob(
  audio: Buffer,
  filename: string
): Promise<BatchJob> {
  const form = new FormData();
  form.append("config", JSON.stringify(batchConfig()));
  form.append(
    "files",
    new Blob([new Uint8Array(audio)], { type: "audio/wav" }),
    filename
  );

  const response = await gnaniFetch("/stt/v3/batch/jobs", {
    method: "POST",
    body: form,
  });

  return (await response.json()) as BatchJob;
}

async function createPresignedJob(
  audio: Buffer,
  filename: string
): Promise<BatchJob> {
  const createResponse = await gnaniFetch("/stt/v3/batch/v2/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: batchConfig(),
      source: {
        type: "direct_upload_url",
        files: [{ filename }],
      },
    }),
  });

  const created = (await createResponse.json()) as BatchJob & {
    uploads?: Array<{ url?: string }>;
  };

  const uploadUrl = created.uploads?.[0]?.url;
  if (!uploadUrl) {
    throw new Error("Gnani did not return a presigned upload URL");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/wav" },
    body: new Uint8Array(audio),
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Gnani presigned upload failed (${uploadResponse.status})`
    );
  }

  return created;
}

async function startJob(jobId: string): Promise<void> {
  await gnaniFetch(`/stt/v3/batch/jobs/${jobId}/start`, { method: "POST" });
}

async function waitForJob(jobId: string): Promise<BatchJob> {
  const deadline = Date.now() + 15 * 60 * 1000;
  let delay = 2000;

  while (Date.now() < deadline) {
    const response = await gnaniFetch(`/stt/v3/batch/jobs/${jobId}`);
    const job = (await response.json()) as BatchJob;

    if (TERMINAL_STATUSES.has(job.status)) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.5), 10000);
  }

  throw new Error("Timed out waiting for Gnani transcription");
}

async function getTranscriptUrl(jobId: string): Promise<string> {
  const completedResponse = await gnaniFetch(
    `/stt/v3/batch/jobs/${jobId}/files?status=COMPLETED`
  );
  const completed = (await completedResponse.json()) as {
    data?: BatchFile[];
  };

  const file = completed.data?.find(
    (item) => item.status === "COMPLETED" && item.transcript_url
  );
  if (file?.transcript_url) {
    return file.transcript_url;
  }

  // Surface the per-file error when nothing completed.
  const allResponse = await gnaniFetch(`/stt/v3/batch/jobs/${jobId}/files`);
  const all = (await allResponse.json()) as { data?: BatchFile[] };
  const failure = all.data?.find((item) => item.error_message);
  throw new Error(
    failure?.error_message
      ? `Gnani transcription failed: ${failure.error_message}`
      : "Gnani returned no transcript"
  );
}

function normalizeTranscript(doc: TranscriptDocument): GnaniTranscript {
  const rawSegments = Array.isArray(doc.segments) ? doc.segments : [];

  const segments: GnaniSegment[] = rawSegments
    .filter(
      (segment) =>
        typeof segment.text === "string" && segment.text.trim().length > 0
    )
    .map((segment) => {
      const start = Number(segment.start_time) || 0;
      const end = Number(segment.end_time) || start;
      const speaker =
        typeof segment.speaker_id === "number" && segment.speaker_id >= 0
          ? `speaker_${segment.speaker_id}`
          : null;

      return {
        text: (segment.text ?? "").trim(),
        start,
        end,
        speakerId: speaker,
      };
    });

  const text = (doc.full_transcript ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (segments.length === 0 && text) {
    segments.push({
      text,
      start: 0,
      end: 0,
      speakerId: null,
    });
  }

  return {
    text,
    language:
      doc.language_code ?? doc.detected_language_code ?? GNANI_LANGUAGE,
    segments,
  };
}

/**
 * Transcribe an audio buffer with Gnani Batch, including speaker diarization.
 * Uses a direct multipart upload for files up to 10 MB and a presigned upload
 * for larger recordings.
 */
export async function transcribeAudio(
  audio: Buffer,
  filename = "recording.wav"
): Promise<GnaniTranscript> {
  const job =
    audio.byteLength <= MAX_DIRECT_UPLOAD_BYTES
      ? await createDirectJob(audio, filename)
      : await createPresignedJob(audio, filename);

  await startJob(job.job_id);
  await waitForJob(job.job_id);

  const transcriptUrl = await getTranscriptUrl(job.job_id);
  const transcriptResponse = await fetch(transcriptUrl);
  if (!transcriptResponse.ok) {
    throw new Error(
      `Failed to download Gnani transcript (${transcriptResponse.status})`
    );
  }

  const doc = (await transcriptResponse.json()) as TranscriptDocument;
  return normalizeTranscript(doc);
}
