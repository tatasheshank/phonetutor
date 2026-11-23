import {
  DEFAULT_LANGUAGE,
  getLanguage,
  isLearnerId,
  isLanguageCode,
  isSpeechRate,
  resolveVoice,
  type LanguageConfig,
  type ParticipantSettings,
  type VoiceOption,
} from "@ai-tutor/shared";

/**
 * Reads the learner's settings from participant metadata (set by the web app when it mints the token).
 * Never trusts the shape: anything missing or invalid falls back to Telugu defaults.
 */
export function parseSettings(metadata: string | undefined): {
  settings: ParticipantSettings;
  language: LanguageConfig;
  voice: VoiceOption;
} {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = metadata ? JSON.parse(metadata) : {};
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    // fall through to defaults
  }

  const tutorLanguage = isLanguageCode(raw.tutorLanguage) ? raw.tutorLanguage : DEFAULT_LANGUAGE;
  const screenLanguage = isLanguageCode(raw.screenLanguage) ? raw.screenLanguage : "en";
  const language = getLanguage(tutorLanguage);

  // Per-learner endpointing from onboarding, clamped to a sane range.
  const endpointingMs =
    typeof raw.endpointingMs === "number" && raw.endpointingMs >= 400 && raw.endpointingMs <= 2500
      ? raw.endpointingMs
      : language.endpointingMs;

  const learnerId = isLearnerId(raw.learnerId) ? raw.learnerId : undefined;
  const lessonId = typeof raw.lessonId === "string" && /^[a-z0-9-]{1,80}$/.test(raw.lessonId) ? raw.lessonId : undefined;

  // Voice and speed the learner picked; unknown ids fall back to the language default.
  const voice = resolveVoice(language, typeof raw.voiceId === "string" ? raw.voiceId : null);
  const speechRate = isSpeechRate(raw.speechRate) ? raw.speechRate : "normal";

  return {
    settings: { learnerId, tutorLanguage, screenLanguage, endpointingMs, lessonId, voiceId: voice.id, speechRate },
    language,
    voice,
  };
}
