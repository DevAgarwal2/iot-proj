import { NextRequest, NextResponse } from "next/server";
import { getMistralClient, MISTRAL_INSIGHTS_MODEL } from "@/lib/mistral";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are an expert at analyzing lecture transcripts. Analyze the provided transcript (which may be in Hindi, English, or mixed languages) and provide insights in proper English.

Return a JSON object with exactly these fields:
- "summary": a concise 2-3 sentence overview of the lecture in English
- "keyPoints": an array of 3-6 key takeaway strings in English
- "topics": an array of 2-5 topic label strings in English

Respond ONLY with valid JSON, no markdown fencing, no explanation.`;

/**
 * POST /api/recordings/[id]/insights/generate
 *
 * Streams a Mistral-generated insight summary as plain text. The client
 * accumulates the stream, parses the JSON and persists it via the regular
 * insights endpoint. Keeping this on the server means the API key never
 * reaches the browser.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const transcript: unknown = body?.transcript;

    if (typeof transcript !== "string" || !transcript.trim()) {
      return NextResponse.json(
        { error: "transcript is required" },
        { status: 400 }
      );
    }

    const client = await getMistralClient();
    const stream = await client.chat.stream({
      model: MISTRAL_INSIGHTS_MODEL,
      temperature: 0.3,
      maxTokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this lecture transcript:\n\n${transcript}`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            const content = event.data.choices?.[0]?.delta?.content;
            const text =
              typeof content === "string"
                ? content
                : Array.isArray(content)
                  ? content
                      .map((chunk) =>
                        "text" in chunk && typeof chunk.text === "string"
                          ? chunk.text
                          : ""
                      )
                      .join("")
                  : "";

            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (error) {
          console.error("Insights stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating insights:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
