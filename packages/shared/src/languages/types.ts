/**
 * Every language-specific value lives in a LanguageConfig.
 * Nothing else in the codebase should branch on a language code.
 * To add a language: add a config file, register it in ./index.ts,
 * add UI strings, add a locale pack for every lesson, and pass the speech test.
 */

export type LanguageCode = "te" | "hi" | "en";

export type LanguageStatus = "launch" | "beta" | "disabled";

export type SttProvider = "sarvam" | "google-chirp" | "azure" | "deepgram";
export type TtsProvider = "sarvam" | "google" | "azure";

/** One selectable tutor voice. Sample clip: apps/web/public/voices/<lang>/<id>.mp3 */
export interface VoiceOption {
  /** Stable id stored in the learner's profile, e.g. "kavitha-friendly". */
  id: string;
  model: "bulbul:v3" | "bulbul:v4-flash";
  /** Sarvam speaker name for that model. */
  speaker: string;
  gender: "female" | "male";
  style: "friendly" | "storyteller" | "classic";
  /** Name shown to learners, in the language's own script. */
  name: string;
  /** bulbul:v3 only: higher = more expressive delivery (0.01-1, Sarvam default 0.6). */
  temperature?: number;
}

/** Speaking speed the learner picks. Normal sounds most natural; slow helps some older learners. */
export const SPEECH_RATES = { slow: 0.85, normal: 1.0, fast: 1.12 } as const;
export type SpeechRate = keyof typeof SPEECH_RATES;

export interface LanguageConfig {
  /** Short code used in URLs, DB rows and lesson locale keys. */
  code: LanguageCode;
  /** BCP-47 tag sent to speech providers. */
  bcp47: string;
  name: { native: string; en: string };
  /** ISO 15924 script code. */
  script: "Telu" | "Deva" | "Latn";
  status: LanguageStatus;
  /** Lower number = shown earlier in the language picker. */
  order: number;
  /** mode "codemix": English words stay in English, Indic words in native script. */
  stt: { provider: SttProvider; model: string; mode?: "transcribe" | "codemix" | "translate"; fallback?: SttProvider };
  /** Default voice: `voice` must be the id of one of `voices`. */
  tts: { provider: TtsProvider; model: string; voice: string; speed: number };
  /** Voices the learner can choose from in the voice picker. The first is shown first. */
  voices: VoiceOption[];
  /** Silence (ms) that ends the learner's turn. Tuned per language in M1, per learner in onboarding. */
  endpointingMs: number;
  /** 0..1, higher = less sensitive to background noise. */
  vadThreshold: number;
  /** Languages learners mix into their speech. */
  codeMixing: LanguageCode[];
  /** "translate-to-en": classify intent on an English translation as well as the original. */
  intentPath: "native" | "translate-to-en";
  /** Max words for a live LLM answer. Telugu/Hindi use more tokens per word. */
  maxAnswerWords: number;
  font: { family: string; lineHeight: number };
  safety: { helpline: string; reportUrl: string };
  /** Short authored lines the agent can speak without calling the LLM. */
  phrases: {
    greeting: string;
    oneMoment: string;
    didNotUnderstand: string;
    shallWeContinue: string;
    scamHelp: string;
    /** Praise after a correct practice tap. */
    wellDone: string;
    /** Said before the tutor demonstrates a step the learner couldn't do. */
    letMeShow: string;
    lessonComplete: string;
    quizIntro: string;
  };
  /** Instruction appended to the LLM system prompt for this language. */
  llmStyle: string;
}
