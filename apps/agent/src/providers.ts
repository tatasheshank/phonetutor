import * as anthropic from "@livekit/agents-plugin-anthropic";
import * as openai from "@livekit/agents-plugin-openai";
import * as sarvam from "@livekit/agents-plugin-sarvam";
import { resolveVoice, SPEECH_RATES, type LanguageConfig, type SpeechRate, type VoiceOption } from "@ai-tutor/shared";

/**
 * Builds the speech and language models for one language.
 * Only Sarvam is wired up for speech. M1 decides per-language providers; add them here.
 */
export function buildStt(lang: LanguageConfig) {
  if (lang.stt.provider !== "sarvam") {
    throw new Error(`STT provider "${lang.stt.provider}" for ${lang.code} is not wired up yet`);
  }
  return new sarvam.STT({
    model: "saaras:v3",
    languageCode: lang.bcp47,
    mode: lang.stt.mode ?? "transcribe",
    // Cost: with streaming off, LiveKit uses VAD and sends only the stretches where
    // someone is speaking, so we don't pay for silence. Set STT_STREAMING=true to
    // compare latency.
    streaming: sttStreaming(),
  });
}

/**
 * The tutor's voice: the learner's chosen VoiceOption at their chosen speed
 * (falls back to the language default; see parseSettings).
 */
export function buildTts(lang: LanguageConfig, voice: VoiceOption = resolveVoice(lang), rate: SpeechRate = "normal") {
  if (lang.tts.provider !== "sarvam") {
    throw new Error(`TTS provider "${lang.tts.provider}" for ${lang.code} is not wired up yet`);
  }
  // The plugin's types only list v2/v3, but the request format is the same for bulbul:v4-flash.
  return new sarvam.TTS({
    model: voice.model as "bulbul:v3",
    speaker: voice.speaker,
    targetLanguageCode: lang.bcp47,
    pace: SPEECH_RATES[rate],
    // bulbul:v3 only: a little more expressive than Sarvam's default.
    ...(voice.model === "bulbul:v3" && voice.temperature ? { temperature: voice.temperature } : {}),
  });
}

/**
 * LLM for live answers.
 *   LLM_PROVIDER=sarvam (default)  -> Sarvam chat API (OpenAI-compatible)
 *   LLM_PROVIDER=anthropic         -> Claude
 * LLM_MODEL overrides the model for either provider.
 */
export function llmChoice(): { provider: "sarvam" | "anthropic"; model: string } {
  const provider = process.env.LLM_PROVIDER || "sarvam";
  if (provider === "anthropic") {
    return { provider, model: process.env.LLM_MODEL || "claude-opus-5-5" };
  }
  if (provider === "sarvam") {
    // "-conversations" has reasoning off: faster and cheaper for short spoken answers.
    return { provider, model: process.env.LLM_MODEL || "sarvam-105b-conversations" };
  }
  throw new Error(`Unknown LLM_PROVIDER "${provider}" (use "sarvam" or "anthropic")`);
}

export function buildLlm() {
  const { provider, model } = llmChoice();

  if (provider === "anthropic") {
    return new anthropic.LLM({ model, maxTokens: 2048 });
  }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error("SARVAM_API_KEY is not set");
  return new openai.LLM({
    baseURL: "https://api.sarvam.ai/v1",
    apiKey,
    model,
    temperature: 0.6,
    maxCompletionTokens: 300,
  });
}

export function sttStreaming(): boolean {
  return process.env.STT_STREAMING === "true";
}
