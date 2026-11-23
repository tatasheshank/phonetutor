/**
 * Detects a learner who says they already shared an OTP/PIN or lost money.
 * When this fires, the agent plays the authored scam-help script, never an LLM answer.
 *
 * Keyword lists are a first pass: extend them from real M1 transcripts.
 * Transcripts arrive in code-mix form, so English words stay in English.
 */
const PATTERNS: RegExp[] = [
  // English and code-mixed
  /\b(otp|pin|password)\b.*\b(told|gave|shared|share|cheppa|cheppanu|bataya|bata diya|de diya)\b/i,
  /\b(told|gave|shared)\b.*\b(otp|pin|password)\b/i,
  /\b(lost|cut|deducted|debited|stolen)\b.*\b(money|rupees|amount|account)\b/i,
  /\b(money|amount)\b.*\b(lost|cut|deducted|debited|stolen|poyindi|gaya|kat gaya)\b/i,
  /\bfraud\b|\bscam\b|\bcheat(ed)?\b/i,
  // Telugu
  /డబ్బులు\s*(పోయాయి|పోయింది|కట్\s*అయ్యాయి)/,
  /మోసం/,
  /(OTP|ఓటీపీ|పిన్).{0,20}(చెప్పాను|ఇచ్చాను|చెప్పేశాను)/i,
  // Hindi
  /पैसे\s*(कट|चले)\s*गए/,
  /धोखा/,
  /(OTP|ओटीपी|पिन).{0,20}(बता\s*दिया|दे\s*दिया|बताया)/i,
];

export function isScamEmergency(transcript: string): boolean {
  return PATTERNS.some((p) => p.test(transcript));
}

/** Blanks out digit runs of 4+ (OTPs, PINs, card and account numbers) before logging. */
export function redact(text: string): string {
  return text.replace(/\d[\d\s-]{2,}\d/g, (m) => (m.replace(/\D/g, "").length >= 4 ? "[redacted]" : m));
}
