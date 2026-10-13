import { NextResponse } from "next/server";
import {
  getMistralClient,
  MISTRAL_REALTIME_MODEL,
  MISTRAL_REALTIME_URL,
} from "@/lib/mistral";

export const runtime = "nodejs";

/**
 * Mints a short-lived realtime token for the browser.
 *
 * Browsers cannot keep the long-lived API key secret nor set Authorization
 * headers on WebSockets, so the server exchanges its key for a scoped `rt_*`
 * token that the client passes via the `Sec-WebSocket-Protocol` header.
 *
 * See https://docs.mistral.ai/studio/audio/speech_to_text/realtime_transcription/client_auth
 */
export async function POST() {
  try {
    const client = await getMistralClient();
    const session = await client.realtime.sessions.create({
      purpose: "realtime",
      model: MISTRAL_REALTIME_MODEL,
    });

    return NextResponse.json({
      token: session.clientSecret.value,
      model: MISTRAL_REALTIME_MODEL,
      url: MISTRAL_REALTIME_URL,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("Failed to create realtime session:", error);
    return NextResponse.json(
      { error: "Failed to create realtime session" },
      { status: 500 }
    );
  }
}
