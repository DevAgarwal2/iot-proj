/**
 * Gnani Timbre v3.0 text-to-speech settings for the Class Pulse briefing.
 *
 * Timbre v3.0 is Gnani's latest TTS model. Every v3.0 voice speaks all ten
 * supported Indian languages, so we pick the voice whose persona best fits a
 * short, warm e-learning narration for each language.
 *
 * Safe to import from the browser: no server-only code lives here.
 */

export const GNANI_TTS_DEFAULT_MODEL = "timbre-v3.0";

/** The ten languages Gnani Timbre supports (plus Hinglish on v2.5 only). */
const VOICE_BY_LANGUAGE: Record<string, string> = {
  "en-IN": "Vasudha", // expressive, composed narration / e-learning
  "hi-IN": "Shivani", // warm, patient, empathy-first
  "ta-IN": "Lakshmi", // expressive, warm storytelling
  "te-IN": "Riyaa", // confident, lively
  "kn-IN": "Chetana", // gentle, empathetic
  "ml-IN": "Tarika", // warm, reassuring
  "mr-IN": "Kalpana", // empathetic, composed
  "bn-IN": "Vasudha",
  "gu-IN": "Shivani",
  "pa-IN": "Yashraj", // warm narrative
};

export interface GnaniVoiceChoice {
  /** Timbre v3.0 voice name. */
  voice: string;
  /** BCP-47 language code accepted by the TTS endpoint. */
  language: string;
}

/** Returns the curated voice for a language, or null when TTS is unsupported. */
export function gnaniTtsVoice(language: string): GnaniVoiceChoice | null {
  const code = language.trim();
  const voice = VOICE_BY_LANGUAGE[code];
  return voice ? { voice, language: code } : null;
}

/** Languages that can be read aloud with Gnani TTS. */
export function gnaniTtsLanguages(): string[] {
  return Object.keys(VOICE_BY_LANGUAGE);
}
