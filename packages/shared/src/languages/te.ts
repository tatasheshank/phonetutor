import type { LanguageConfig } from "./types";

// Primary language. Phrases are drafts: get them checked by a native Telugu reviewer.
// Provider model and voice names are starting choices; confirm against Sarvam docs and M1 results.
export const te: LanguageConfig = {
  code: "te",
  bcp47: "te-IN",
  name: { native: "తెలుగు", en: "Telugu" },
  script: "Telu",
  status: "launch",
  order: 1,
  stt: { provider: "sarvam", model: "saaras:v3", mode: "codemix", fallback: "google-chirp" },
  // Learners pick their own voice (VoiceStep). Speed defaults to normal: slowed-down TTS sounds flat.
  tts: { provider: "sarvam", model: "bulbul:v4-flash", voice: "kavitha-friendly", speed: 1.0 },
  voices: [
    { id: "kavitha-friendly", model: "bulbul:v4-flash", speaker: "kavitha_te_conversation", gender: "female", style: "friendly", name: "కవిత" },
    { id: "pooja-friendly", model: "bulbul:v4-flash", speaker: "pooja_te_conversation", gender: "female", style: "friendly", name: "పూజ" },
    { id: "shruti-classic", model: "bulbul:v3", speaker: "shruti", gender: "female", style: "classic", name: "శ్రుతి", temperature: 0.8 },
    { id: "priya-classic", model: "bulbul:v3", speaker: "priya", gender: "female", style: "classic", name: "ప్రియ", temperature: 0.8 },
    { id: "kavitha-classic", model: "bulbul:v3", speaker: "kavitha", gender: "female", style: "classic", name: "కవిత", temperature: 0.8 },
    { id: "kavitha-storyteller", model: "bulbul:v4-flash", speaker: "kavitha_te_narration", gender: "female", style: "storyteller", name: "కవిత" },
    { id: "tarun-storyteller", model: "bulbul:v4-flash", speaker: "tarun_te_narration", gender: "male", style: "storyteller", name: "తరుణ్" },
    { id: "anand-classic", model: "bulbul:v3", speaker: "anand", gender: "male", style: "classic", name: "ఆనంద్", temperature: 0.8 },
  ],
  endpointingMs: 900,
  vadThreshold: 0.6,
  codeMixing: ["en"],
  intentPath: "translate-to-en",
  maxAnswerWords: 40,
  font: { family: "Noto Sans Telugu", lineHeight: 1.7 },
  safety: { helpline: "1930", reportUrl: "cybercrime.gov.in" },
  phrases: {
    wellDone: "చాలా బాగుంది! సరిగ్గా నొక్కారు.",
    letMeShow: "పర్వాలేదు, నేను చూపిస్తాను. ఇక్కడ మెరుస్తున్న చోటు చూడండి.",
    lessonComplete: "అభినందనలు! ఈ పాఠం పూర్తయింది. ఏమైనా అడగాలనుకుంటే అడగండి.",
    quizIntro: "ఇప్పుడు మీరు నేర్చుకున్నది ఒక్కసారి చేసి చూద్దాం.",
    greeting:
      "నమస్కారం! నేను మీ టీచర్‌ని. మీకు ఫోన్ వాడటం నేర్పిస్తాను. మీకు ఏ సందేహం ఉన్నా ఎప్పుడైనా అడగండి.",
    oneMoment: "ఒక్క నిమిషం...",
    didNotUnderstand:
      "క్షమించండి, నాకు సరిగ్గా వినిపించలేదు. ఇంకోసారి చెప్తారా? లేదా స్క్రీన్ మీద బటన్ నొక్కండి.",
    shallWeContinue: "సరే, ముందుకు వెళ్దామా?",
    scamHelp:
      "కంగారు పడకండి. వెంటనే 1930 కి కాల్ చేయండి. మీ బ్యాంక్‌కి కూడా కాల్ చేయండి. ఇంట్లో ఎవరికైనా చెప్పండి. ఎవరికీ OTP కానీ PIN కానీ చెప్పకండి.",
  },
  llmStyle:
    "Reply in simple, everyday spoken Telugu (Telugu script) that people in both Andhra Pradesh and Telangana understand. " +
    "Use the respectful మీరు form. Keep app words in English as people say them: WhatsApp, call, button, OTP, UPI, video call. " +
    "Write numbers as digits. Use short sentences. Do not use bookish or formal Telugu.",
};
