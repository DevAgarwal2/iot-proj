/**
 * End-word ("trigger word") helpers.
 *
 * A transcript line is only finalized when one of the configured end words is
 * spoken. The end word is kept at the end of the completed line; everything
 * after it starts the next line.
 */

/** Normalize a configured end word for storage/comparison. */
export function normalizeEndWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive whole-word (or phrase) matcher for the given end
 * words. Longer phrases are tried first so "that is all" wins over "all".
 * Returns null when there are no usable words.
 */
export function buildEndWordRegex(endWords: string[]): RegExp | null {
  const words = Array.from(
    new Set(endWords.map(normalizeEndWord).filter(Boolean))
  ).sort((a, b) => b.length - a.length);

  if (words.length === 0) {
    return null;
  }

  return new RegExp(`\\b(?:${words.map(escapeRegExp).join("|")})\\b`, "gi");
}

export interface EndWordSplit {
  /** Completed lines, end word included. */
  lines: string[];
  /** Text after the last trigger — the start of the next line. */
  remainder: string;
}

/** Split accumulated text into completed lines at end-word boundaries. */
export function splitByEndWords(text: string, endWords: string[]): EndWordSplit {
  const regex = buildEndWordRegex(endWords);
  if (!regex) {
    return { lines: [], remainder: text };
  }

  const lines: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  regex.lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    // Include the end word itself in the completed line.
    const line = text.slice(lastIndex, match.index + match[0].length).trim();
    if (line) {
      lines.push(line);
    }
    lastIndex = match.index + match[0].length;
  }

  return { lines, remainder: text.slice(lastIndex) };
}

export interface DiarizedSegmentInput {
  text: string;
  start: number | null;
  end: number | null;
  speakerId?: string | null;
}

export interface GroupedLine {
  text: string;
  startTime: number;
  endTime: number;
  speakerId: string | null;
}

/**
 * Re-group diarized segments into end-word lines, keeping a speaker and an
 * approximate time range for each line. With no end words this returns one
 * line per segment (the previous behaviour).
 */
export function groupSegmentsByEndWords(
  segments: DiarizedSegmentInput[],
  endWords: string[]
): GroupedLine[] {
  const regex = buildEndWordRegex(endWords);

  if (!regex) {
    return segments
      .map((segment) => ({
        text: segment.text.trim(),
        startTime: segment.start ?? 0,
        endTime: segment.end ?? segment.start ?? 0,
        speakerId: segment.speakerId ?? null,
      }))
      .filter((line) => line.text.length > 0);
  }

  // Flatten to a single string with per-character start time and speaker.
  const chars: string[] = [];
  const charStart: number[] = [];
  const charSpeaker: (string | null)[] = [];

  for (const segment of segments) {
    const start = segment.start ?? 0;
    const end = segment.end ?? start;
    const length = segment.text.length;
    for (let i = 0; i < length; i++) {
      chars.push(segment.text[i]);
      charStart.push(length > 0 ? start + (end - start) * (i / length) : start);
      charSpeaker.push(segment.speakerId ?? null);
    }
  }

  const combined = chars.join("");
  const lines: GroupedLine[] = [];

  const addLine = (from: number, to: number) => {
    const raw = combined.slice(from, to);
    const trimmed = raw.trim();
    if (!trimmed) return;

    const leading = raw.length - raw.trimStart().length;
    const lineStart = from + leading;
    const lineEnd = lineStart + trimmed.length - 1;

    lines.push({
      text: trimmed,
      startTime: charStart[lineStart] ?? 0,
      endTime:
        charStart[lineEnd] ??
        charStart[lineStart] ??
        charStart[from] ??
        0,
      speakerId: charSpeaker[lineStart] ?? null,
    });
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((match = regex.exec(combined)) !== null) {
    // Keep the end word at the end of the line.
    addLine(lastIndex, match.index + match[0].length);
    lastIndex = match.index + match[0].length;
  }
  addLine(lastIndex, combined.length);

  return lines;
}
