import type { LanguageConfig } from "./types";

export const en: LanguageConfig = {
  code: "en",
  bcp47: "en-IN",
  name: { native: "English", en: "English" },
  script: "Latn",
  status: "launch",
  order: 3,
  stt: { provider: "sarvam", model: "saaras:v3", mode: "transcribe", fallback: "google-chirp" },
  tts: { provider: "sarvam", model: "bulbul:v4-flash", voice: "ritu-friendly", speed: 1.0 },
  voices: [
    { id: "ritu-friendly", model: "bulbul:v4-flash", speaker: "ritu_en_edtech", gender: "female", style: "friendly", name: "Ritu" },
    { id: "simran-friendly", model: "bulbul:v4-flash", speaker: "simran_en_conversation", gender: "female", style: "friendly", name: "Simran" },
    { id: "neha-friendly", model: "bulbul:v4-flash", speaker: "neha_en_customer", gender: "female", style: "friendly", name: "Neha" },
    { id: "priya-classic", model: "bulbul:v3", speaker: "priya", gender: "female", style: "classic", name: "Priya", temperature: 0.8 },
    { id: "simran-storyteller", model: "bulbul:v4-flash", speaker: "simran_en_narration", gender: "female", style: "storyteller", name: "Simran" },
    { id: "anand-classic", model: "bulbul:v3", speaker: "anand", gender: "male", style: "classic", name: "Anand", temperature: 0.8 },
  ],
  endpointingMs: 900,
  vadThreshold: 0.6,
  codeMixing: [],
  intentPath: "native",
  maxAnswerWords: 60,
  font: { family: "Noto Sans", lineHeight: 1.5 },
  safety: { helpline: "1930", reportUrl: "cybercrime.gov.in" },
  phrases: {
    wellDone: "Very good! You tapped the right one.",
    letMeShow: "That's okay, let me show you. Look at the glowing spot.",
    lessonComplete: "Well done! You finished this lesson. Ask me anything if you like.",
    quizIntro: "Now let's try what you learned, one more time.",
    greeting:
      "Hello! I am your teacher. I will help you learn to use your phone. You can ask me a question any time.",
    oneMoment: "One moment...",
    didNotUnderstand:
      "Sorry, I could not hear that clearly. Please say it again, or tap the button on the screen.",
    shallWeContinue: "Okay, shall we continue?",
    scamHelp:
      "Don't worry. Call 1930 right away. Call your bank too. Tell someone at home. Never tell anyone your OTP or PIN.",
  },
  llmStyle:
    "Reply in simple Indian English for an older person who is new to smartphones. " +
    "Use short sentences and common words. Write numbers as digits.",
};
