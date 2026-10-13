/**
 * Voxtral reports languages as ISO codes (e.g. "en") or names (e.g. "English").
 * Normalize them to the BCP-47 style codes the UI expects.
 */
export function normalizeLanguage(language: string | null | undefined): string {
  if (!language) {
    return "en-IN";
  }

  const value = language.trim();
  const byCode: Record<string, string> = {
    en: "en-IN",
    hi: "hi-IN",
    bn: "bn-IN",
    ta: "ta-IN",
    te: "te-IN",
    gu: "gu-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    mr: "mr-IN",
    pa: "pa-IN",
    or: "od-IN",
    od: "od-IN",
  };
  const byName: Record<string, string> = {
    english: "en-IN",
    hindi: "hi-IN",
    bengali: "bn-IN",
    tamil: "ta-IN",
    telugu: "te-IN",
    gujarati: "gu-IN",
    kannada: "kn-IN",
    malayalam: "ml-IN",
    marathi: "mr-IN",
    punjabi: "pa-IN",
    odia: "od-IN",
    oriya: "od-IN",
  };
  const lower = value.toLowerCase();

  return byCode[lower] || byName[lower] || value;
}
