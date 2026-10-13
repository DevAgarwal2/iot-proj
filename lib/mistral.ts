import { Mistral } from "@mistralai/mistralai";
import { getMistralApiKey } from "@/lib/secrets";

/**
 * Voxtral models used by the app.
 *
 * - `MISTRAL_REALTIME_MODEL`  live streaming transcription (browser WebSocket)
 * - `MISTRAL_TRANSCRIBE_MODEL` offline transcription with speaker diarization
 * - `MISTRAL_INSIGHTS_MODEL`   text LLM used to summarize transcripts
 *
 * See https://docs.mistral.ai/capabilities/audio/ for model details.
 */
export const MISTRAL_REALTIME_MODEL = "voxtral-mini-transcribe-realtime-2602";
export const MISTRAL_TRANSCRIBE_MODEL = "voxtral-mini-latest";
export const MISTRAL_INSIGHTS_MODEL = "mistral-small-latest";

export const MISTRAL_REALTIME_URL =
  "wss://api.mistral.ai/v1/audio/transcriptions/realtime";

let client: Mistral | null = null;

/** Build a Mistral client from an explicit key. */
export function createMistralClient(apiKey: string): Mistral {
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not set");
  }
  return new Mistral({ apiKey });
}

/**
 * Returns a shared server-side Mistral client.
 *
 * The API key is resolved from the environment or AWS Secrets Manager (see
 * `lib/secrets.ts`) and only ever read on the server. Browser clients receive a
 * short-lived realtime token instead (see `app/api/realtime/session`).
 */
export async function getMistralClient(): Promise<Mistral> {
  if (!client) {
    client = createMistralClient(await getMistralApiKey());
  }
  return client;
}
