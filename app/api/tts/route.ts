import { NextRequest, NextResponse } from "next/server";
import { GNANI_BASE_URL } from "@/lib/gnani";
import {
  GNANI_TTS_DEFAULT_MODEL,
  gnaniTtsVoice,
} from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.GNANI_TTS_MODEL || GNANI_TTS_DEFAULT_MODEL;
/** Optional global voice override (must be a Timbre v3.0 voice). */
const VOICE_OVERRIDE = process.env.GNANI_TTS_VOICE || "";

const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function gnaniTtsRequest(
  url: string,
  init: RequestInit
): Promise<Response> {
  let delay = 600;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, init);
    if (
      response.ok ||
      !RETRYABLE_STATUSES.has(response.status) ||
      attempt === 4
    ) {
      return response;
    }
    const retryAfter = response.headers.get("retry-after");
    const wait =
      retryAfter && /^\d+$/.test(retryAfter)
        ? Math.max(delay, Number(retryAfter) * 1000)
        : delay;
    await sleep(wait);
    delay = Math.min(delay * 2, 8000);
  }
  throw new Error("Gnani TTS request failed after retries");
}

/**
 * POST /api/tts
 *   { text, language } -> audio/wav
 *
 * Keeps the Gnani key on the server and returns the synthesized WAV directly so
 * the browser can play it with a plain <audio> element.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const language =
      typeof body?.language === "string" ? body.language.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const choice = gnaniTtsVoice(language);
    if (!choice) {
      return NextResponse.json(
        { error: "Read-aloud is not available for this language." },
        { status: 422 }
      );
    }

    const apiKey = process.env.GNANI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GNANI_API_KEY is not set on the server." },
        { status: 500 }
      );
    }

    const response = await gnaniTtsRequest(
      `${GNANI_BASE_URL}/api/v1/tts/inference`,
      {
        method: "POST",
        headers: {
          "X-API-Key-ID": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.slice(0, 2600),
          voice: VOICE_OVERRIDE || choice.voice,
          model: MODEL,
          language: choice.language,
          speed: 1.0,
          audio_config: {
            sample_rate: 24000,
            num_channels: 1,
            sample_width: 2,
            encoding: "linear_pcm",
            container: "wav",
          },
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "Gnani TTS error:",
        response.status,
        detail.slice(0, 300)
      );
      return NextResponse.json(
        { error: "Could not generate the spoken audio." },
        { status: 502 }
      );
    }

    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { error: "Could not generate the spoken audio." },
      { status: 500 }
    );
  }
}
