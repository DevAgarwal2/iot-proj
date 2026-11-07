/**
 * Class Pulse — shared analysis helpers (no framework / server imports, so the
 * same code runs in the browser and in the API route).
 *
 * Everything numeric (pace, pauses, time per topic, the clarity score) is
 * computed here deterministically from the transcript timings. The language
 * model is only asked for judgement calls (topic boundaries, where students
 * likely got lost, plain-language coaching) and every answer it gives is
 * validated against the real transcript before it is shown.
 */

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/** Words per minute above which delivery counts as "fast". */
export const PACE_FAST = 160;
/** Words per minute above which delivery counts as a "burst". */
export const PACE_BURST = 185;
/** Top of the pace chart. */
export const PACE_CHART_MAX = 220;
/** A silence at least this long (seconds) counts as student wait time. */
export const WAIT_PAUSE_SECONDS = 3;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface PulseSpeakerInput {
  id?: string;
  label?: string;
  name?: string | null;
}

export interface PulseSegmentInput {
  text: string;
  startTime?: number | null;
  endTime?: number | null;
  speakerId?: string | null;
  speaker?: PulseSpeakerInput | null;
}

export interface TimelineLine {
  /** 1-based line number (what the model sees as #n). */
  n: number;
  text: string;
  start: number;
  end: number;
  words: number;
  longWords: number;
  /** "P" for the professor, "S1", "S2"… for other voices. */
  speaker: string;
  isProfessor: boolean;
  /** True when start/end came from the recording, not from an estimate. */
  measured: boolean;
}

export interface Timeline {
  lines: TimelineLine[];
  totalSeconds: number;
  timing: "measured" | "estimated";
  professorWords: number;
  otherVoices: number;
  fingerprint: string;
}

export type PaceLevel = "silent" | "calm" | "fast" | "burst";

export interface PaceBucket {
  index: number;
  start: number;
  end: number;
  words: number;
  wpm: number;
  speakingRatio: number;
  density: number;
  /** 0-100 composite of pace and vocabulary density. */
  load: number;
  level: PaceLevel;
}

export interface PaceBurst {
  start: number;
  end: number;
  peakWpm: number;
  avgWpm: number;
}

export interface PaceStats {
  bucketSec: number;
  buckets: PaceBucket[];
  bursts: PaceBurst[];
  /** Professor words per minute over the whole lecture. */
  avgWpm: number;
  /** Professor words per minute while actually speaking. */
  speakingWpm: number;
  fastShare: number;
  burstShare: number;
  waitPauses: number;
  longestPause: number;
  timing: "measured" | "estimated";
  totalSeconds: number;
}

export type ConfusionKind =
  | "student_question"
  | "reexplained"
  | "rushed_concept"
  | "jargon_unexplained"
  | "skipped_step"
  | "unclear_claim";

export const CONFUSION_KINDS: ConfusionKind[] = [
  "student_question",
  "reexplained",
  "rushed_concept",
  "jargon_unexplained",
  "skipped_step",
  "unclear_claim",
];

export const KIND_LABEL: Record<ConfusionKind, string> = {
  student_question: "Student asked",
  reexplained: "Had to re-explain",
  rushed_concept: "Rushed concept",
  jargon_unexplained: "Unexplained term",
  skipped_step: "Skipped a step",
  unclear_claim: "Unclear claim",
};

export interface ConfusionPoint {
  id: string;
  line: number;
  /** Seconds from the start of the lecture. */
  time: number;
  kind: ConfusionKind;
  basis: "observed" | "predicted";
  severity: 1 | 2 | 3;
  topic: string;
  evidence: string;
  why: string;
  fix: string;
  /** Professor pace on that line when known. */
  wpm: number | null;
}

export type TopicStatus = "rushed" | "balanced" | "over";

export interface TopicTime {
  id: string;
  name: string;
  spans: { fromLine: number; toLine: number }[];
  start: number;
  seconds: number;
  share: number;
  /** 1-5: how much explanation the topic deserves. */
  weight: number;
  expectedShare: number;
  status: TopicStatus;
  why: string;
}

export interface PulseAnalysis {
  version: 1;
  generatedAt: string;
  fingerprint: string;
  model: string;
  topics: TopicTime[];
  confusion: ConfusionPoint[];
}

export interface PulseBrief {
  language: string;
  headline: string;
  balanceNote: string;
  coaching: string[];
  confusion: Record<string, { why: string; fix: string }>;
  topics: Record<string, { name: string; why: string }>;
}

/** A short script written specifically for text-to-speech playback. */
export interface PulseSpeech {
  language: string;
  script: string;
}

export interface ClarityScore {
  /** 0-100, higher is clearer. */
  total: number;
  confusion: number;
  pace: number;
  balance: number;
}

/* ------------------------------------------------------------------ */
/* Languages                                                           */
/* ------------------------------------------------------------------ */

export interface PulseLanguage {
  code: string;
  name: string;
  native: string;
}

export const PULSE_LANGUAGES: PulseLanguage[] = [
  { code: "en-IN", name: "English", native: "English" },
  { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
  { code: "mr-IN", name: "Marathi", native: "मराठी" },
  { code: "bn-IN", name: "Bengali", native: "বাংলা" },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
  { code: "te-IN", name: "Telugu", native: "తెలుగు" },
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "es-ES", name: "Spanish", native: "Español" },
  { code: "fr-FR", name: "French", native: "Français" },
  { code: "de-DE", name: "German", native: "Deutsch" },
  { code: "ar-SA", name: "Arabic", native: "العربية" },
  { code: "zh-CN", name: "Chinese (Mandarin)", native: "中文" },
  { code: "ja-JP", name: "Japanese", native: "日本語" },
];

export function languageName(code: string): string {
  return PULSE_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const WORD_RE = /[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*/gu;

export function tokenize(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

function letterLength(word: string): number {
  return Array.from(word).length;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "12.4" — minutes with one decimal, trailing .0 removed. */
export function formatMinutes(seconds: number): string {
  const value = Math.round((Math.max(0, seconds) / 60) * 10) / 10;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return cleaned.trim().slice(0, max);
}

function toInt(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value.replace(/[^\d-]/g, ""), 10)
        : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parse model output that should be JSON but may be fenced or padded. */
export function parseJsonLoose(text: string): Record<string, unknown> | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const attempts = [stripped];
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) attempts.push(match[0]);
  for (const attempt of attempts) {
    try {
      return asRecord(JSON.parse(attempt));
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

/** Average conversational speed used when real timings are missing. */
const FALLBACK_WORDS_PER_SECOND = 2.5;

export function buildTimeline(
  segments: PulseSegmentInput[],
  durationSec: number
): Timeline {
  const cleaned = segments
    .map((s, i) => ({ s, i, text: (s.text ?? "").trim() }))
    .filter((x) => x.text.length > 0);

  const speakerKey = (s: PulseSegmentInput) =>
    s.speaker?.id ?? s.speakerId ?? "_";

  // The professor is whoever speaks the most.
  const wordsBySpeaker = new Map<string, number>();
  for (const { s, text } of cleaned) {
    const key = speakerKey(s);
    wordsBySpeaker.set(key, (wordsBySpeaker.get(key) ?? 0) + countWords(text));
  }
  let professorKey = "_";
  let best = -1;
  for (const [key, words] of wordsBySpeaker) {
    if (words > best) {
      best = words;
      professorKey = key;
    }
  }

  const measuredCount = cleaned.filter(
    ({ s }) => (s.endTime ?? 0) > (s.startTime ?? 0)
  ).length;
  const timing: "measured" | "estimated" =
    cleaned.length >= 3 && measuredCount / cleaned.length >= 0.6
      ? "measured"
      : "estimated";

  const ordered =
    timing === "measured"
      ? [...cleaned].sort(
          (a, b) =>
            (a.s.startTime ?? 0) - (b.s.startTime ?? 0) || a.i - b.i
        )
      : cleaned;

  const otherCodes = new Map<string, string>();
  const codeFor = (key: string) => {
    if (key === professorKey) return "P";
    if (!otherCodes.has(key)) otherCodes.set(key, `S${otherCodes.size + 1}`);
    return otherCodes.get(key)!;
  };

  const totalWords = ordered.reduce((sum, x) => sum + countWords(x.text), 0);
  const estimatedTotal =
    durationSec > 0 ? durationSec : totalWords / FALLBACK_WORDS_PER_SECOND;

  const lines: TimelineLine[] = [];
  let cumulativeWords = 0;

  for (const { s, text } of ordered) {
    const tokens = tokenize(text);
    const words = tokens.length;
    const longWords = tokens.filter((t) => letterLength(t) >= 9).length;
    const key = speakerKey(s);

    let start: number;
    let end: number;
    let measured: boolean;

    if (timing === "measured") {
      start = Math.max(0, s.startTime ?? 0);
      const rawEnd = s.endTime ?? 0;
      measured = rawEnd > start;
      end = measured ? rawEnd : start + words / FALLBACK_WORDS_PER_SECOND;
    } else {
      const denom = Math.max(totalWords, 1);
      start = (estimatedTotal * cumulativeWords) / denom;
      end = (estimatedTotal * (cumulativeWords + words)) / denom;
      measured = false;
    }
    cumulativeWords += words;

    lines.push({
      n: lines.length + 1,
      text,
      start,
      end,
      words,
      longWords,
      speaker: codeFor(key),
      isProfessor: key === professorKey,
      measured,
    });
  }

  const lastEnd = lines.reduce((m, l) => Math.max(m, l.end), 0);
  const totalSeconds = Math.max(durationSec || 0, lastEnd);
  const totalChars = lines.reduce((sum, l) => sum + l.text.length, 0);

  return {
    lines,
    totalSeconds,
    timing,
    professorWords: lines
      .filter((l) => l.isProfessor)
      .reduce((sum, l) => sum + l.words, 0),
    otherVoices: otherCodes.size,
    fingerprint: `${lines.length}:${totalChars}`,
  };
}

/** Professor pace on one line, or null when it can't be trusted. */
export function lineWpm(line: TimelineLine): number | null {
  if (!line.isProfessor || !line.measured) return null;
  const duration = line.end - line.start;
  if (duration < 3 || line.words < 6) return null;
  return Math.round((line.words / duration) * 60);
}

/* ------------------------------------------------------------------ */
/* Pace                                                                */
/* ------------------------------------------------------------------ */

function pickBucketSize(totalSeconds: number): number {
  const raw = totalSeconds / 48;
  const options = [15, 30, 60, 120, 180, 300, 600];
  return options.find((o) => o >= raw) ?? 600;
}

export function computePace(tl: Timeline): PaceStats {
  const total = Math.max(tl.totalSeconds, 1);
  const bucketSec = pickBucketSize(total);
  const count = Math.max(1, Math.ceil(total / bucketSec));

  const words = new Array<number>(count).fill(0);
  const longWords = new Array<number>(count).fill(0);
  const speakSeconds = new Array<number>(count).fill(0);

  const professorLines = tl.lines.filter((l) => l.isProfessor);

  for (const line of professorLines) {
    const duration = Math.max(line.end - line.start, 0.001);
    const first = Math.min(count - 1, Math.floor(line.start / bucketSec));
    const last = Math.min(
      count - 1,
      Math.floor(Math.max(line.start, line.end - 0.0001) / bucketSec)
    );
    for (let b = first; b <= last; b++) {
      const overlap =
        Math.min(line.end, (b + 1) * bucketSec) -
        Math.max(line.start, b * bucketSec);
      if (overlap <= 0 && first !== last) continue;
      const frac =
        first === last ? 1 : Math.min(1, Math.max(0, overlap) / duration);
      words[b] += line.words * frac;
      longWords[b] += line.longWords * frac;
      speakSeconds[b] += first === last ? duration : Math.max(0, overlap);
    }
  }

  const buckets: PaceBucket[] = [];
  for (let b = 0; b < count; b++) {
    const start = b * bucketSec;
    const end = Math.min(total, start + bucketSec);
    const length = Math.max(end - start, 1);
    const wpm = words[b] / (length / 60);
    const speakingRatio = Math.min(1, speakSeconds[b] / length);
    const density = words[b] > 0 ? longWords[b] / words[b] : 0;

    let level: PaceLevel;
    if (speakingRatio < 0.15 || words[b] < 5) level = "silent";
    else if (wpm >= PACE_BURST) level = "burst";
    else if (wpm >= PACE_FAST) level = "fast";
    else level = "calm";

    const paceScore = clamp((wpm - 120) / 80, 0, 1);
    const densityScore = clamp((density - 0.12) / 0.18, 0, 1);
    const load =
      level === "silent"
        ? 0
        : Math.round(100 * (0.65 * paceScore + 0.35 * densityScore));

    buckets.push({
      index: b,
      start,
      end,
      words: Math.round(words[b]),
      wpm: Math.round(wpm),
      speakingRatio,
      density,
      load,
      level,
    });
  }

  // Burst windows: consecutive buckets that are very fast or very loaded.
  const bursts: PaceBurst[] = [];
  let open: PaceBucket[] = [];
  const flush = () => {
    if (open.length === 0) return;
    bursts.push({
      start: open[0].start,
      end: open[open.length - 1].end,
      peakWpm: Math.max(...open.map((b) => b.wpm)),
      avgWpm: Math.round(open.reduce((s, b) => s + b.wpm, 0) / open.length),
    });
    open = [];
  };
  for (const bucket of buckets) {
    const isBurst =
      bucket.level !== "silent" &&
      (bucket.level === "burst" ||
        (bucket.load >= 75 && bucket.wpm >= PACE_FAST));
    if (isBurst) open.push(bucket);
    else flush();
  }
  flush();
  const topBursts = [...bursts]
    .sort((a, b) => b.peakWpm - a.peakWpm)
    .slice(0, 6)
    .sort((a, b) => a.start - b.start);

  const speakingBuckets = buckets.filter((b) => b.level !== "silent");
  const share = (pred: (b: PaceBucket) => boolean) =>
    speakingBuckets.length === 0
      ? 0
      : speakingBuckets.filter(pred).length / speakingBuckets.length;

  const professorSeconds = professorLines.reduce(
    (sum, l) => sum + Math.max(0, l.end - l.start),
    0
  );

  // Wait time: silences between consecutive professor lines.
  let waitPauses = 0;
  let longestPause = 0;
  if (tl.timing === "measured") {
    const sorted = [...professorLines].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].start - sorted[i - 1].end;
      if (gap >= WAIT_PAUSE_SECONDS) waitPauses++;
      if (gap > longestPause) longestPause = gap;
    }
  }

  return {
    bucketSec,
    buckets,
    bursts: topBursts,
    avgWpm: Math.round(tl.professorWords / (total / 60)),
    speakingWpm:
      professorSeconds > 0
        ? Math.round(tl.professorWords / (professorSeconds / 60))
        : 0,
    fastShare: share((b) => b.wpm >= PACE_FAST),
    burstShare: share((b) => b.wpm >= PACE_BURST),
    waitPauses,
    longestPause,
    timing: tl.timing,
    totalSeconds: total,
  };
}

/* ------------------------------------------------------------------ */
/* Topics (time vs importance)                                         */
/* ------------------------------------------------------------------ */

function normalizeName(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildTopics(raw: unknown, tl: Timeline): TopicTime[] {
  const n = tl.lines.length;
  if (!Array.isArray(raw) || n === 0) return [];
  const total = Math.max(tl.totalSeconds, 1);

  interface Draft {
    name: string;
    from: number;
    weight: number;
    why: string;
  }

  const drafts: Draft[] = [];
  for (const item of raw.slice(0, 14)) {
    const r = asRecord(item);
    if (!r) continue;
    const name = cleanText(r.name, 80);
    const from = toInt(r.fromLine);
    if (!name || from === null) continue;
    drafts.push({
      name,
      from: clamp(from, 1, n),
      weight: clamp(toInt(r.weight) ?? 3, 1, 5),
      why: cleanText(r.why, 220),
    });
  }
  if (drafts.length === 0) return [];

  drafts.sort((a, b) => a.from - b.from);
  // Strictly increasing starts; the first topic always starts at line 1.
  const cleaned: Draft[] = [];
  for (const d of drafts) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && d.from <= prev.from) continue;
    cleaned.push(d);
  }
  cleaned[0].from = 1;

  const startOfLine = (line: number) =>
    line <= 1 ? 0 : tl.lines[line - 1].start;

  interface Piece {
    draft: Draft;
    fromLine: number;
    toLine: number;
    start: number;
    seconds: number;
  }
  const pieces: Piece[] = cleaned.map((d, i) => {
    const next = cleaned[i + 1];
    const toLine = next ? next.from - 1 : n;
    const start = startOfLine(d.from);
    const end = next ? Math.max(startOfLine(next.from), start) : total;
    return {
      draft: d,
      fromLine: d.from,
      toLine,
      start,
      seconds: Math.max(0, end - start),
    };
  });

  // Merge pieces that share a name (the lecture returned to a topic).
  const merged = new Map<string, TopicTime>();
  for (const piece of pieces) {
    const key = normalizeName(piece.draft.name);
    const existing = merged.get(key);
    if (existing) {
      existing.spans.push({ fromLine: piece.fromLine, toLine: piece.toLine });
      existing.seconds += piece.seconds;
      existing.weight = Math.max(existing.weight, piece.draft.weight);
    } else {
      merged.set(key, {
        id: `t${merged.size + 1}`,
        name: piece.draft.name,
        spans: [{ fromLine: piece.fromLine, toLine: piece.toLine }],
        start: piece.start,
        seconds: piece.seconds,
        share: 0,
        weight: piece.draft.weight,
        expectedShare: 0,
        status: "balanced",
        why: piece.draft.why,
      });
    }
  }

  const topics = Array.from(merged.values());
  const weightSum = topics.reduce((s, t) => s + t.weight, 0) || 1;
  for (const t of topics) {
    t.share = t.seconds / total;
    t.expectedShare = t.weight / weightSum;
    const ratio = t.expectedShare > 0 ? t.share / t.expectedShare : 1;
    if (
      t.weight >= 3 &&
      (ratio < 0.6 || (t.weight >= 4 && t.seconds < 120 && total > 600))
    ) {
      t.status = "rushed";
    } else if (ratio > 1.6 && t.share - t.expectedShare > 0.15) {
      t.status = "over";
    } else {
      t.status = "balanced";
    }
  }
  return topics;
}

export function topicForLine(
  topics: TopicTime[],
  line: number
): TopicTime | null {
  for (const t of topics) {
    if (t.spans.some((s) => line >= s.fromLine && line <= s.toLine)) return t;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Confusion points                                                    */
/* ------------------------------------------------------------------ */

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildConfusion(
  raw: unknown,
  tl: Timeline,
  topics: TopicTime[]
): ConfusionPoint[] {
  const n = tl.lines.length;
  if (!Array.isArray(raw) || n === 0) return [];

  const out: ConfusionPoint[] = [];
  const seen = new Set<string>();

  for (const item of raw.slice(0, 16)) {
    const r = asRecord(item);
    if (!r) continue;
    const lineNo = toInt(r.line);
    if (lineNo === null || lineNo < 1 || lineNo > n) continue;
    const line = tl.lines[lineNo - 1];

    const kind = CONFUSION_KINDS.includes(r.kind as ConfusionKind)
      ? (r.kind as ConfusionKind)
      : null;
    if (!kind) continue;

    const key = `${lineNo}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const why = cleanText(r.why, 260);
    const fix = cleanText(r.fix, 300);
    if (!why) continue;

    // The quote must really come from that line; otherwise show the line.
    let evidence = cleanText(r.evidence, 240);
    if (!evidence || !norm(line.text).includes(norm(evidence))) {
      const words = line.text.split(/\s+/);
      evidence =
        words.length > 22 ? `${words.slice(0, 22).join(" ")}…` : line.text;
    }

    const sev = clamp(toInt(r.severity) ?? 2, 1, 3) as 1 | 2 | 3;
    const basis = r.basis === "observed" ? "observed" : "predicted";

    out.push({
      id: `c${out.length + 1}`,
      line: lineNo,
      time: line.start,
      kind,
      basis,
      severity: sev,
      topic: topicForLine(topics, lineNo)?.name ?? "",
      evidence,
      why,
      fix,
      wpm: lineWpm(line),
    });
  }

  out.sort((a, b) => a.time - b.time);
  out.forEach((c, i) => {
    c.id = `c${i + 1}`;
  });
  return out.slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Score                                                               */
/* ------------------------------------------------------------------ */

export function computeScore(
  pace: PaceStats,
  topics: TopicTime[],
  confusion: ConfusionPoint[]
): ClarityScore {
  const minutes = Math.max(pace.totalSeconds / 60, 1);

  const weighted = confusion.reduce(
    (sum, c) => sum + c.severity * (c.basis === "observed" ? 1.25 : 1),
    0
  );
  const confusionPenalty = clamp(weighted / (minutes * 0.6), 0, 1);

  const pacePenalty = clamp((pace.burstShare + 0.5 * pace.fastShare) / 0.35, 0, 1);

  const weightSum = topics.reduce((s, t) => s + t.weight, 0);
  const rushedWeight = topics
    .filter((t) => t.status === "rushed")
    .reduce((s, t) => s + t.weight, 0);
  const balancePenalty =
    weightSum > 0 ? clamp(rushedWeight / weightSum / 0.7, 0, 1) : 0;

  const total = Math.round(
    100 -
      (45 * confusionPenalty + 30 * pacePenalty + 25 * balancePenalty)
  );
  return {
    total: clamp(total, 0, 100),
    confusion: Math.round(100 * (1 - confusionPenalty)),
    pace: Math.round(100 * (1 - pacePenalty)),
    balance: Math.round(100 * (1 - balancePenalty)),
  };
}

/* ------------------------------------------------------------------ */
/* Model input / output                                                */
/* ------------------------------------------------------------------ */

/** Numbered, timestamped transcript the model can point back into. */
export function buildModelTranscript(tl: Timeline, maxChars = 70000): string {
  const header = (l: TimelineLine) => {
    const wpm = lineWpm(l);
    return `[#${l.n} | ${formatClock(l.start)} | ${l.speaker}${
      wpm ? ` | ${wpm} wpm` : ""
    }]`;
  };
  const totalChars = tl.lines.reduce(
    (sum, l) => sum + l.text.length + header(l).length + 2,
    0
  );
  const cap =
    totalChars > maxChars
      ? Math.max(120, Math.floor(maxChars / Math.max(tl.lines.length, 1)) - 40)
      : Infinity;

  return tl.lines
    .map((l) => {
      const text = l.text.length > cap ? `${l.text.slice(0, cap)}…` : l.text;
      return `${header(l)} ${text}`;
    })
    .join("\n");
}

/** Facts the briefing model may quote. Everything here is computed. */
export function buildBriefFacts(
  pace: PaceStats,
  analysis: Pick<PulseAnalysis, "topics" | "confusion">,
  score: ClarityScore
) {
  return {
    lectureMinutes: Math.round((pace.totalSeconds / 60) * 10) / 10,
    clarityScoreOutOf100: score.total,
    pace: {
      averageWordsPerMinute: pace.avgWpm,
      whileSpeakingWordsPerMinute: pace.speakingWpm,
      recommendedRange: "120 to 160 words per minute",
      fastBurstWindows: pace.bursts.map((b) => ({
        from: formatClock(b.start),
        to: formatClock(b.end),
        peakWordsPerMinute: b.peakWpm,
      })),
      pausesOfThreeSecondsOrMore: pace.waitPauses,
      timingIsEstimated: pace.timing === "estimated",
    },
    topics: analysis.topics.map((t) => ({
      name: t.name,
      minutes: Math.round((t.seconds / 60) * 10) / 10,
      percentOfLecture: Math.round(t.share * 100),
      percentItDeserved: Math.round(t.expectedShare * 100),
      status: t.status,
    })),
    confusionPoints: analysis.confusion.map((c) => ({
      at: formatClock(c.time),
      kind: KIND_LABEL[c.kind],
      evidenceType: c.basis,
      topic: c.topic,
      why: c.why,
      suggestedFix: c.fix,
    })),
  };
}

export function sanitizeBrief(
  raw: unknown,
  language: string,
  analysis: Pick<PulseAnalysis, "topics" | "confusion">
): PulseBrief | null {
  const r = asRecord(raw);
  if (!r) return null;

  const headline = cleanText(r.headline, 320);
  if (!headline) return null;

  const coaching = Array.isArray(r.coaching)
    ? r.coaching
        .map((c) => cleanText(c, 320))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const confusion: PulseBrief["confusion"] = {};
  if (Array.isArray(r.confusion)) {
    analysis.confusion.forEach((c, i) => {
      const item = asRecord(r.confusion instanceof Array ? r.confusion[i] : null);
      const why = cleanText(item?.why, 300);
      const fix = cleanText(item?.fix, 340);
      if (why || fix) confusion[c.id] = { why: why || c.why, fix: fix || c.fix };
    });
  }

  const topics: PulseBrief["topics"] = {};
  if (Array.isArray(r.topics)) {
    analysis.topics.forEach((t, i) => {
      const item = asRecord(r.topics instanceof Array ? r.topics[i] : null);
      const name = cleanText(item?.name, 90);
      const why = cleanText(item?.why, 240);
      if (name || why) topics[t.id] = { name: name || t.name, why: why || t.why };
    });
  }

  return {
    language,
    headline,
    balanceNote: cleanText(r.balanceNote, 520),
    coaching,
    confusion,
    topics,
  };
}

/** Validate the dedicated text-to-speech script. */
export function sanitizeSpeech(
  raw: unknown,
  language: string
): PulseSpeech | null {
  const r = asRecord(raw);
  if (!r) return null;

  const script = cleanText(r.script, 2600);
  if (!script) return null;

  return { language, script };
}

/** Light validation of an analysis object sent back by the browser. */
export function sanitizeAnalysis(raw: unknown): PulseAnalysis | null {
  const r = asRecord(raw);
  if (!r || !Array.isArray(r.topics) || !Array.isArray(r.confusion)) return null;

  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const topics: TopicTime[] = [];
  for (const item of r.topics.slice(0, 14)) {
    const t = asRecord(item);
    if (!t) continue;
    const status: TopicStatus =
      t.status === "rushed" || t.status === "over" ? t.status : "balanced";
    topics.push({
      id: cleanText(t.id, 12) || `t${topics.length + 1}`,
      name: cleanText(t.name, 90),
      spans: [],
      start: num(t.start),
      seconds: Math.max(0, num(t.seconds)),
      share: clamp(num(t.share), 0, 1),
      weight: clamp(Math.round(num(t.weight, 3)), 1, 5),
      expectedShare: clamp(num(t.expectedShare), 0, 1),
      status,
      why: cleanText(t.why, 240),
    });
  }

  const confusion: ConfusionPoint[] = [];
  for (const item of r.confusion.slice(0, 12)) {
    const c = asRecord(item);
    if (!c || !CONFUSION_KINDS.includes(c.kind as ConfusionKind)) continue;
    confusion.push({
      id: cleanText(c.id, 12) || `c${confusion.length + 1}`,
      line: Math.max(1, Math.round(num(c.line, 1))),
      time: Math.max(0, num(c.time)),
      kind: c.kind as ConfusionKind,
      basis: c.basis === "observed" ? "observed" : "predicted",
      severity: clamp(Math.round(num(c.severity, 2)), 1, 3) as 1 | 2 | 3,
      topic: cleanText(c.topic, 90),
      evidence: cleanText(c.evidence, 240),
      why: cleanText(c.why, 300),
      fix: cleanText(c.fix, 340),
      wpm: typeof c.wpm === "number" ? c.wpm : null,
    });
  }

  return {
    version: 1,
    generatedAt: cleanText(r.generatedAt, 40),
    fingerprint: cleanText(r.fingerprint, 40),
    model: cleanText(r.model, 60),
    topics,
    confusion,
  };
}
