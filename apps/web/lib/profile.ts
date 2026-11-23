import {
  isLanguageCode,
  isLearnerId,
  isSpeechRate,
  newLearnerId,
  type LanguageCode,
  type SpeechRate,
} from "@ai-tutor/shared";

/**
 * Learner settings kept on the device until accounts exist (M4).
 * TODO(M4): move to the users and consents tables after phone OTP login.
 */
export interface Profile {
  /** Stable per-device ID, used to attribute costs and payments to a learner. */
  learnerId: string;
  /** Language of the app itself: menus, buttons, messages. */
  appLanguage?: LanguageCode;
  /** Language the teacher speaks and teaches in. Can differ from the app language. */
  tutorLanguage?: LanguageCode;
  screenLanguage?: LanguageCode;
  consentAt?: string;
  consentVersion?: number;
  recordingOptIn?: boolean;
  /** Picked tutor voice per language (VoiceOption id). Missing = not chosen yet. */
  voices?: Partial<Record<LanguageCode, string>>;
  speechRate?: SpeechRate;
}

const KEY = "tutor.profile.v1";

export function loadProfile(): Profile {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
  } catch {
    // corrupt or blocked storage: start fresh
  }
  const learnerId = isLearnerId(raw.learnerId) ? raw.learnerId : newLearnerId();
  const profile: Profile = {
    learnerId,
    tutorLanguage: isLanguageCode(raw.tutorLanguage) ? raw.tutorLanguage : undefined,
    // Profiles from before the split had one language for both: keep using it for the app.
    appLanguage: isLanguageCode(raw.appLanguage)
      ? raw.appLanguage
      : isLanguageCode(raw.tutorLanguage)
        ? raw.tutorLanguage
        : undefined,
    screenLanguage: isLanguageCode(raw.screenLanguage) ? raw.screenLanguage : undefined,
    consentAt: typeof raw.consentAt === "string" ? raw.consentAt : undefined,
    consentVersion: typeof raw.consentVersion === "number" ? raw.consentVersion : undefined,
    recordingOptIn: raw.recordingOptIn === true,
    voices:
      raw.voices && typeof raw.voices === "object"
        ? Object.fromEntries(
            Object.entries(raw.voices as Record<string, unknown>).filter(
              ([k, v]) => isLanguageCode(k) && typeof v === "string",
            ),
          )
        : undefined,
    speechRate: isSpeechRate(raw.speechRate) ? raw.speechRate : undefined,
  };
  // Persist a newly created ID straight away so it stays the same across visits.
  if (raw.learnerId !== learnerId) saveProfile(profile);
  return profile;
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode or storage blocked: onboarding just runs again next time.
  }
}
