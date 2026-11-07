import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  SARVAM_CHAT_MODEL,
  SarvamApiError,
  completeChat,
  getSarvamClient,
} from "@/lib/sarvam";
import {
  CONFUSION_KINDS,
  buildBriefFacts,
  buildConfusion,
  buildModelTranscript,
  buildTimeline,
  buildTopics,
  computePace,
  computeScore,
  languageName,
  parseJsonLoose,
  sanitizeAnalysis,
  sanitizeBrief,
  sanitizeSpeech,
  type PulseAnalysis,
} from "@/lib/pulse";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MODEL = process.env.SARVAM_PULSE_MODEL || SARVAM_CHAT_MODEL;
/** The conversational 105B variant caps output at 8192 tokens. */
const MODEL_MAX_TOKENS = MODEL.includes("conversations") ? 8192 : 16384;

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const ANALYZE_PROMPT = `You are an educational analyst reviewing a college lecture for the professor who gave it. The transcript may be in English, Hindi, Hinglish or another Indian language. Always write your answer in English.

Every transcript line looks like:
[#12 | 03:41 | P | 212 wpm] text of the line
#12 is the line number, 03:41 is the time from the start of the lecture, P is the professor (S1, S2... are other voices such as students; if voices could not be told apart everything is P), and the last field is the professor's speaking pace on that line when it is known.

Do two jobs.

JOB 1 - TOPICS
Split the lecture into 2 to 8 topics in the order they were taught. "fromLine" is the first line of the topic; a topic runs until the next topic starts, so the first topic must start at line 1 and "fromLine" must increase for every topic. Give "toLine" as the last line of the topic.
"weight" is 1 to 5: how much explanation time the topic deserves given how hard and how important it is. 1 = announcements, housekeeping or small talk. 3 = an ordinary supporting idea. 5 = a hard core concept that students usually struggle with and later material depends on.
"why" is one short sentence explaining the weight.

JOB 2 - CONFUSION POINTS
Find the moments where students most likely did not understand. Allowed kinds:
- student_question: a student asks something, asks the professor to repeat ("sir, can you repeat", "samajh nahi aaya", "dobara bolo"), or says they are lost.
- reexplained: the professor repeats or rephrases something ("let me say that again", "what I mean is", "sorry, let me redo this"), which signals the first explanation did not land.
- rushed_concept: an important idea delivered very fast (see the wpm field) or in one breath with no example.
- jargon_unexplained: a technical term used without being defined.
- skipped_step: a step in a derivation, proof, algorithm or code walkthrough that is jumped over.
- unclear_claim: a vague, contradictory or ambiguous statement.

Rules:
- "line" is the line number where the confusion arises (for a student question, the line with the question).
- "basis" is "observed" only when the transcript itself shows it (a student voice or question, or the professor visibly re-explaining). Otherwise it is "predicted".
- "severity" is 1 (minor), 2 (noticeable) or 3 (many students would be lost).
- "evidence" is a short quote copied EXACTLY, word for word, from that line in its original language (at most 20 words).
- "why" is at most 25 words. "fix" is at most 30 words and says what the professor can say or do at the start of the next class.
- Return at most 8 points, most important first. Only report what the transcript really supports. If the lecture has no real confusion points return an empty array. Never invent quotes.

Reply with ONLY a JSON object, no markdown:
{"topics":[{"name":"","fromLine":1,"toLine":1,"weight":3,"why":""}],"confusion":[{"line":1,"kind":"${CONFUSION_KINDS.join("|")}","basis":"observed|predicted","severity":2,"evidence":"","why":"","fix":""}]}`;

function briefPrompt(languageLabel: string) {
  return `You write a short, private end-of-class briefing for a college professor, entirely in ${languageLabel}.

You receive FACTS computed from the real lecture recording. Use only those facts. Never invent numbers, times, quotes or topics.

Write warm, direct, specific ${languageLabel} for a busy professor. Keep well-known technical terms in the form people normally use in ${languageLabel}; they may stay in English letters.

Return ONLY a JSON object, no markdown:
{
 "headline": one sentence, at most 20 words, the single most important takeaway,
 "balanceNote": at most 30 words about how lecture time was split,
 "coaching": exactly 3 concrete tips for the next class, each at most 22 words,
 "confusion": one item per confusion point, SAME ORDER and SAME LENGTH as the facts, each {"why":"the reason in ${languageLabel}, at most 20 words","fix":"what to say next class in ${languageLabel}, at most 25 words"},
 "topics": one item per topic, SAME ORDER and SAME LENGTH as the facts, each {"name":"the topic name in ${languageLabel}","why":"one short sentence on whether the time split was right"}
}

Do not repeat the clarity score. Be specific, not generic.`;
}

function speechPrompt(languageLabel: string) {
  return `You write a short script that a text-to-speech voice will read aloud to a college professor right after class. Write entirely in ${languageLabel}.

You receive FACTS computed from the real lecture recording. Use only those facts. Never invent numbers, times, quotes or topics.

Write for the ear, not the page:
- 80 to 130 words. Never longer.
- Short, simple sentences. One idea per sentence.
- No lists, headings, markdown, emoji, symbols or abbreviations.
- Write times and numbers the way a person says them ("around twelve minutes", not "12 min").
- Warm and direct, like a colleague giving quick feedback after class.
- Order: the overall verdict, the biggest confusion point and what to say next class, the speaking pace, the time balance, one closing suggestion.
- If there are no confusion points, say that plainly.
- If "timingIsEstimated" is true, say the pace figures are approximate.

Reply with ONLY a JSON object, no markdown: {"script":"..."}`;
}

/* ------------------------------------------------------------------ */
/* Sarvam helper                                                       */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function completeJson(
  system: string,
  user: string,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const client = getSarvamClient();
  let lastError: unknown = new Error("Model returned invalid JSON");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await completeChat(client, {
        model: MODEL,
        temperature: 0.2,
        maxTokens,
        responseFormat: "json_object",
        reasoningEffort: "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const parsed = parseJsonLoose(text);
      if (parsed) return parsed;
      lastError = new Error("Model returned invalid JSON");
    } catch (error) {
      lastError = error;
      const status = error instanceof SarvamApiError ? error.status : undefined;
      // Only rate limits and server errors are worth retrying.
      if (typeof status === "number" && status !== 429 && status < 500) {
        throw error;
      }
    }
    await sleep(900 * 2 ** attempt);
  }
  throw lastError;
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

async function loadTimeline(id: string) {
  const recording = await prisma.recording.findUnique({
    where: { id },
    include: {
      segments: { include: { speaker: true }, orderBy: { timestamp: "asc" } },
    },
  });
  if (!recording) return null;
  const timeline = buildTimeline(
    recording.segments.map((s) => ({
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
      speakerId: s.speakerId,
      speaker: s.speaker
        ? { id: s.speaker.id, label: s.speaker.label, name: s.speaker.name }
        : null,
    })),
    recording.duration
  );
  return { recording, timeline };
}

// POST /api/recordings/[id]/pulse
//   { stage: "analyze" }                          -> { analysis }
//   { stage: "brief", language, analysis }        -> { brief }
//   { stage: "speech", language, analysis }       -> { speech }
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const stage = body?.stage;

    const loaded = await loadTimeline(id);
    if (!loaded) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }
    const { timeline } = loaded;

    if (timeline.lines.length === 0 || timeline.professorWords < 20) {
      return NextResponse.json(
        { error: "This recording has no transcript to analyse yet." },
        { status: 422 }
      );
    }

    if (stage === "analyze") {
      const raw = await completeJson(
        ANALYZE_PROMPT,
        `Lecture length: ${Math.round(timeline.totalSeconds / 60)} minutes. Lines: ${timeline.lines.length}.\n\nTRANSCRIPT\n${buildModelTranscript(timeline)}`,
        MODEL_MAX_TOKENS
      );

      const topics = buildTopics(raw.topics, timeline);
      if (topics.length === 0) {
        return NextResponse.json(
          { error: "The analysis came back empty. Please try again." },
          { status: 502 }
        );
      }
      const confusion = buildConfusion(raw.confusion, timeline, topics);

      const analysis: PulseAnalysis = {
        version: 1,
        generatedAt: new Date().toISOString(),
        fingerprint: timeline.fingerprint,
        model: MODEL,
        topics,
        confusion,
      };
      return NextResponse.json({ analysis });
    }

    if (stage === "brief") {
      const language =
        typeof body?.language === "string" ? body.language.slice(0, 12) : "en-IN";
      const analysis = sanitizeAnalysis(body?.analysis);
      if (!analysis || analysis.topics.length === 0) {
        return NextResponse.json(
          { error: "A valid analysis is required" },
          { status: 400 }
        );
      }

      const pace = computePace(timeline);
      const score = computeScore(pace, analysis.topics, analysis.confusion);
      const facts = buildBriefFacts(pace, analysis, score);

      const raw = await completeJson(
        briefPrompt(languageName(language)),
        `FACTS\n${JSON.stringify(facts)}`,
        MODEL_MAX_TOKENS
      );
      const brief = sanitizeBrief(raw, language, analysis);
      if (!brief) {
        return NextResponse.json(
          { error: "The briefing came back empty. Please try again." },
          { status: 502 }
        );
      }
      return NextResponse.json({ brief });
    }

    if (stage === "speech") {
      const language =
        typeof body?.language === "string" ? body.language.slice(0, 12) : "en-IN";
      const analysis = sanitizeAnalysis(body?.analysis);
      if (!analysis || analysis.topics.length === 0) {
        return NextResponse.json(
          { error: "A valid analysis is required" },
          { status: 400 }
        );
      }

      const pace = computePace(timeline);
      const score = computeScore(pace, analysis.topics, analysis.confusion);
      const facts = buildBriefFacts(pace, analysis, score);

      const raw = await completeJson(
        speechPrompt(languageName(language)),
        `FACTS\n${JSON.stringify(facts)}`,
        MODEL_MAX_TOKENS
      );
      const speech = sanitizeSpeech(raw, language);
      if (!speech) {
        return NextResponse.json(
          { error: "The spoken script came back empty. Please try again." },
          { status: 502 }
        );
      }
      return NextResponse.json({ speech });
    }

    return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
  } catch (error) {
    console.error("Class Pulse error:", error);
    const message =
      error instanceof Error && /SARVAM_API_KEY/.test(error.message)
        ? "SARVAM_API_KEY is not set on the server."
        : "Class Pulse could not finish. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
