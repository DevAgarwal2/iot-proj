/**
 * Sarvam AI chat client (server only).
 *
 * All language-model work in the app goes through Sarvam-105B: the lecture
 * insights and the Class Pulse analysis/briefing. Speech-to-text still runs on
 * Gnani (see `lib/gnani.ts`).
 *
 * The API is OpenAI-compatible (`POST /v1/chat/completions`) but authenticates
 * with the `api-subscription-key` header instead of a bearer token.
 */

export const SARVAM_DEFAULT_BASE_URL = "https://api.sarvam.ai";

/**
 * The conversational variant of Sarvam-105B. It answers in a couple of seconds
 * without the long internal reasoning pass of the flagship `sarvam-105b`, which
 * matters for the interactive Class Pulse report. Set `SARVAM_MODEL=sarvam-105b`
 * to use the flagship reasoning model instead.
 */
export const SARVAM_CHAT_MODEL =
  process.env.SARVAM_MODEL || "sarvam-105b-conversations";

/** Reasonings levels actually accepted by the API (docs also mention max). */
export type SarvamReasoningEffort = "low" | "medium" | "high";

export type SarvamRole = "system" | "user" | "assistant";

export interface SarvamMessage {
  role: SarvamRole;
  content: string;
}

export interface SarvamClient {
  apiKey: string;
  baseUrl: string;
}

export interface SarvamChatOptions {
  messages: SarvamMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask for a single valid JSON object. */
  responseFormat?: "json_object";
  /**
   * The 105B model is a reasoning model. Reasoning tokens count towards
   * `maxTokens`, so leave headroom when this is set.
   */
  reasoningEffort?: SarvamReasoningEffort;
}

export class SarvamApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "SarvamApiError";
    this.status = status;
    this.code = code;
  }
}

function resolveApiKey(): string {
  // `.env` in this project uses the lowercase name, but either works.
  return process.env.SARVAM_API_KEY || process.env.sarvam_api_key || "";
}

function resolveBaseUrl(): string {
  return (process.env.SARVAM_BASE_URL || SARVAM_DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
}

/** Build a Sarvam client from an explicit key. */
export function createSarvamClient(
  apiKey: string,
  baseUrl: string = resolveBaseUrl()
): SarvamClient {
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not set");
  }
  return { apiKey, baseUrl };
}

let sharedClient: SarvamClient | null = null;

/** Returns a shared server-side Sarvam client. */
export function getSarvamClient(): SarvamClient {
  if (!sharedClient) {
    sharedClient = createSarvamClient(resolveApiKey());
  }
  return sharedClient;
}

function buildPayload(
  options: SarvamChatOptions,
  stream: boolean
): Record<string, unknown> {
  return {
    model: options.model || SARVAM_CHAT_MODEL,
    messages: options.messages,
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxTokens !== undefined
      ? { max_tokens: options.maxTokens }
      : {}),
    ...(options.responseFormat
      ? { response_format: { type: options.responseFormat } }
      : {}),
    ...(options.reasoningEffort
      ? { reasoning_effort: options.reasoningEffort }
      : {}),
    stream,
  };
}

async function postChat(
  client: SarvamClient,
  options: SarvamChatOptions,
  stream: boolean
): Promise<Response> {
  const response = await fetch(`${client.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "api-subscription-key": client.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(options, stream)),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Sarvam request failed (${response.status})`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: { message?: string; code?: string };
      };
      if (body?.error?.message) message = body.error.message;
      code = body?.error?.code;
    } catch {
      /* non-JSON error body */
    }
    throw new SarvamApiError(message, response.status, code);
  }

  return response;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) =>
        chunk && typeof chunk === "object" && "text" in chunk
          ? typeof chunk.text === "string"
            ? chunk.text
            : ""
          : ""
      )
      .join("");
  }
  return "";
}

/** One non-streaming completion. Returns the assistant's text. */
export async function completeChat(
  client: SarvamClient,
  options: SarvamChatOptions
): Promise<string> {
  const response = await postChat(client, options, false);
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  return textFromContent(body.choices?.[0]?.message?.content);
}

/**
 * Opens a streaming completion and returns an async iterator of text chunks.
 *
 * The request is performed eagerly (not inside the generator) so callers can
 * turn an upstream error into a proper HTTP error before writing a response.
 */
export async function openChatStream(
  client: SarvamClient,
  options: SarvamChatOptions
): Promise<AsyncGenerator<string>> {
  const response = await postChat(client, options, true);
  if (!response.body) {
    throw new SarvamApiError("Sarvam returned an empty stream", response.status);
  }
  return readSse(response.body);
}

async function* readSse(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (line: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return null;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return null;
    try {
      const json = JSON.parse(data) as {
        choices?: { delta?: { content?: unknown } }[];
      };
      return textFromContent(json.choices?.[0]?.delta?.content) || null;
    } catch {
      return null;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const text = parseLine(line);
        if (text) yield text;
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const text = parseLine(buffer);
      if (text) yield text;
    }
  } finally {
    reader.releaseLock();
  }
}
