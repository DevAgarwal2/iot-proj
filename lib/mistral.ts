import { Mistral } from "@mistralai/mistralai";

/**
 * Mistral is used only for the text insights (summary, key points, topics).
 * Speech-to-text runs on Gnani (see `lib/gnani.ts`).
 */
export const MISTRAL_INSIGHTS_MODEL = "mistral-small-latest";

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
 * The API key is read from the environment on the server only.
 */
export async function getMistralClient(): Promise<Mistral> {
  if (!client) {
    client = createMistralClient(process.env.MISTRAL_API_KEY ?? "");
  }
  return client;
}
