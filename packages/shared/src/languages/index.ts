import { en } from "./en";
import { hi } from "./hi";
import { te } from "./te";
import type { LanguageCode, LanguageConfig, SpeechRate, VoiceOption } from "./types";

export type * from "./types";
export { SPEECH_RATES } from "./types";

const registry: Record<LanguageCode, LanguageConfig> = { te, hi, en };

/** Telugu is the primary audience. */
export const DEFAULT_LANGUAGE: LanguageCode = "te";

export function getLanguage(code: LanguageCode): LanguageConfig {
  return registry[code];
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && Object.hasOwn(registry, value);
}

/** Languages learners can pick, in picker order. */
export function availableLanguages(): LanguageConfig[] {
  return Object.values(registry)
    .filter((l) => l.status !== "disabled")
    .sort((a, b) => a.order - b.order);
}

export const ALL_LANGUAGE_CODES = Object.keys(registry) as LanguageCode[];

/** The learner's chosen voice, or the language default if the id is unknown. */
export function resolveVoice(lang: LanguageConfig, voiceId?: string | null): VoiceOption {
  return lang.voices.find((v) => v.id === voiceId) ?? lang.voices.find((v) => v.id === lang.tts.voice) ?? lang.voices[0]!;
}

export function isSpeechRate(value: unknown): value is SpeechRate {
  return value === "slow" || value === "normal" || value === "fast";
}
