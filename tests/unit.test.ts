import { describe, expect, it } from "bun:test";
import {
  convertFloat32ToInt16,
  createWavBuffer,
  int16ToBase64,
} from "../lib/audio";
import { normalizeLanguage } from "../lib/transcription";
import { createMistralClient } from "../lib/mistral";
import {
  buildEndWordRegex,
  groupSegmentsByEndWords,
  normalizeEndWord,
  splitByEndWords,
} from "../lib/endWords";

describe("audio helpers", () => {
  it("converts float samples to clamped 16-bit PCM", () => {
    const input = new Float32Array([0, 1, -1, 2, -2, 0.5]);
    const out = convertFloat32ToInt16(input);

    expect(out).toBeInstanceOf(Int16Array);
    expect(Array.from(out)).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });

  it("writes a valid mono 16-bit PCM WAV header", () => {
    const sampleCount = 100;
    const buffer = createWavBuffer(new Float32Array(sampleCount), 16000);
    const view = new DataView(buffer);
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, length));

    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(sampleCount * 2); // data size
    expect(buffer.byteLength).toBe(44 + sampleCount * 2);
  });

  it("base64-encodes little-endian int16 PCM round-trip", () => {
    const pcm = new Int16Array([1, -2, 256, -32768, 32767]);
    const decoded = Buffer.from(int16ToBase64(pcm), "base64");
    const roundTrip = new Int16Array(
      decoded.buffer,
      decoded.byteOffset,
      decoded.byteLength / 2
    );

    expect(decoded.byteLength).toBe(pcm.length * 2);
    expect(Array.from(roundTrip)).toEqual(Array.from(pcm));
  });
});

describe("normalizeLanguage", () => {
  it("maps ISO codes and language names to BCP-47 style codes", () => {
    expect(normalizeLanguage("en")).toBe("en-IN");
    expect(normalizeLanguage("English")).toBe("en-IN");
    expect(normalizeLanguage("HINDI")).toBe("hi-IN");
    expect(normalizeLanguage("or")).toBe("od-IN");
    expect(normalizeLanguage("Odia")).toBe("od-IN");
  });

  it("falls back to en-IN for missing values and passes through unknown ones", () => {
    expect(normalizeLanguage(null)).toBe("en-IN");
    expect(normalizeLanguage(undefined)).toBe("en-IN");
    expect(normalizeLanguage("")).toBe("en-IN");
    expect(normalizeLanguage("fr")).toBe("fr");
  });
});

describe("createMistralClient", () => {
  it("creates a client for a non-empty API key", () => {
    expect(createMistralClient("test-key")).toBeDefined();
  });

  it("throws a clear error when the API key is missing", () => {
    expect(() => createMistralClient("")).toThrow("MISTRAL_API_KEY is not set");
  });
});

describe("end words", () => {
  it("normalizes configured words", () => {
    expect(normalizeEndWord("  Done  ")).toBe("done");
    expect(normalizeEndWord("Thank   You")).toBe("thank you");
  });

  it("builds a case-insensitive whole-word matcher", () => {
    const regex = buildEndWordRegex(["done"]);
    expect(regex).not.toBeNull();
    expect(regex!.test("I am DONE now")).toBe(true);
    // word boundary: must not match inside "abandoned"
    expect(buildEndWordRegex(["done"])!.test("abandoned")).toBe(false);
  });

  it("returns null without any end words", () => {
    expect(buildEndWordRegex([])).toBeNull();
    expect(buildEndWordRegex(["   "])).toBeNull();
  });

  it("splits text at end words and keeps the trigger in the line", () => {
    const { lines, remainder } = splitByEndWords(
      "hello world done next part DONE remaining text",
      ["done"]
    );
    expect(lines).toEqual(["hello world done", "next part DONE"]);
    expect(remainder.trim()).toBe("remaining text");
  });

  it("supports multi-word end phrases", () => {
    const { lines, remainder } = splitByEndWords(
      "first topic that is all second topic",
      ["that is all"]
    );
    expect(lines).toEqual(["first topic that is all"]);
    expect(remainder.trim()).toBe("second topic");
  });

  it("keeps the whole text as remainder when nothing matches", () => {
    const { lines, remainder } = splitByEndWords("nothing to see here", ["done"]);
    expect(lines).toEqual([]);
    expect(remainder).toBe("nothing to see here");
  });

  it("groups diarized segments into end-word lines with speaker + times", () => {
    const grouped = groupSegmentsByEndWords(
      [
        { text: "hello world", start: 0, end: 2, speakerId: "speaker_1" },
        { text: " done next", start: 2, end: 4, speakerId: "speaker_1" },
        { text: " part", start: 4, end: 6, speakerId: "speaker_2" },
      ],
      ["done"]
    );

    expect(grouped.map((line) => line.text)).toEqual([
      "hello world done",
      "next part",
    ]);
    expect(grouped[0].startTime).toBe(0);
    expect(grouped[0].speakerId).toBe("speaker_1");
    expect(grouped[1].speakerId).toBe("speaker_1");
  });

  it("returns one line per segment when no end words are configured", () => {
    const grouped = groupSegmentsByEndWords(
      [
        { text: "one", start: 0, end: 1, speakerId: "a" },
        { text: "two", start: 1, end: 2, speakerId: "b" },
      ],
      []
    );
    expect(grouped.map((line) => line.text)).toEqual(["one", "two"]);
    expect(grouped[1].speakerId).toBe("b");
  });
});
