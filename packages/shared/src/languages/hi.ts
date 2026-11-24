import type { LanguageConfig } from "./types";

// Phrases are drafts: get them checked by a native Hindi reviewer.
export const hi: LanguageConfig = {
  code: "hi",
  bcp47: "hi-IN",
  name: { native: "हिंदी", en: "Hindi" },
  script: "Deva",
  status: "launch",
  order: 2,
  stt: { provider: "sarvam", model: "saaras:v3", mode: "codemix", fallback: "google-chirp" },
  tts: { provider: "sarvam", model: "bulbul:v4-flash", voice: "ritu-friendly", speed: 1.0 },
  voices: [
    { id: "ritu-friendly", model: "bulbul:v4-flash", speaker: "ritu_hi_edtech", gender: "female", style: "friendly", name: "रितु" },
    { id: "simran-friendly", model: "bulbul:v4-flash", speaker: "simran_hi_conversation", gender: "female", style: "friendly", name: "सिमरन" },
    { id: "ishita-friendly", model: "bulbul:v4-flash", speaker: "ishita_hi_edtech", gender: "female", style: "friendly", name: "इशिता" },
    { id: "priya-classic", model: "bulbul:v3", speaker: "priya", gender: "female", style: "classic", name: "प्रिया", temperature: 0.8 },
    { id: "simran-storyteller", model: "bulbul:v4-flash", speaker: "simran_hi_narration", gender: "female", style: "storyteller", name: "सिमरन" },
    { id: "shubh-classic", model: "bulbul:v3", speaker: "shubh", gender: "male", style: "classic", name: "शुभ", temperature: 0.8 },
  ],
  endpointingMs: 900,
  vadThreshold: 0.6,
  codeMixing: ["en"],
  intentPath: "translate-to-en",
  maxAnswerWords: 50,
  font: { family: "Noto Sans Devanagari", lineHeight: 1.6 },
  safety: { helpline: "1930", reportUrl: "cybercrime.gov.in" },
  phrases: {
    wellDone: "बहुत बढ़िया! आपने सही दबाया।",
    letMeShow: "कोई बात नहीं, मैं दिखाती हूँ। यहाँ चमकती हुई जगह देखिए।",
    lessonComplete: "बधाई हो! यह पाठ पूरा हो गया। कुछ पूछना हो तो पूछिए।",
    quizIntro: "अब जो सीखा, उसे एक बार करके देखते हैं।",
    demoLimit: "आज के लिए डेमो का समय पूरा हो गया। कल फिर मिलते हैं। धन्यवाद!",
    greeting:
      "नमस्ते! मैं आपकी टीचर हूँ। मैं आपको फ़ोन चलाना सिखाऊँगी। आप कभी भी सवाल पूछ सकते हैं।",
    oneMoment: "एक पल...",
    didNotUnderstand:
      "माफ़ कीजिए, मुझे ठीक से सुनाई नहीं दिया। एक बार फिर बोलिए, या स्क्रीन पर बटन दबाइए।",
    shallWeContinue: "ठीक है, आगे चलें?",
    scamHelp:
      "घबराइए मत। तुरंत 1930 पर कॉल कीजिए। अपने बैंक को भी कॉल कीजिए। घर में किसी को बताइए। किसी को भी OTP या PIN मत बताइए।",
  },
  llmStyle:
    "Reply in simple, everyday spoken Hindi (Devanagari script). Use the respectful आप form. " +
    "Keep app words in English as people say them: WhatsApp, call, button, OTP, UPI, video call. " +
    "Write numbers as digits. Use short sentences.",
};
