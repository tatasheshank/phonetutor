/**
 * Price table and cost estimator. All prices in INR.
 *
 * These are ESTIMATES from public price pages; the provider's own billing is the truth.
 * Update PRICES_CHECKED_ON whenever you change a number.
 *   Sarvam:    https://www.sarvam.ai/api-pricing   (pay-as-you-go)
 *   LiveKit:   https://livekit.com/pricing         (Build plan is free up to 5,000 WebRTC min/month)
 *   Anthropic: https://claude.com/pricing         (USD, converted at USD_INR)
 */
export const PRICES_CHECKED_ON = "2026-11-23";

/** Rough conversion for USD-priced providers. Update when it drifts. */
export const USD_INR = 85;

export const PRICES = {
  /** Sarvam speech-to-text, per minute of audio sent. */
  sttPerMinute: 0.49,

  /** Text-to-speech, per character. */
  ttsPerChar: {
    "bulbul:v3": 3.0 / 1000,
    "bulbul:v4-flash": 2.0 / 1000,
  } as Record<string, number>,

  /** LLM, per token: input, cached input, output. */
  llmPerToken: {
    "sarvam-105b-conversations": { input: 10 / 1e6, cached: 0.25 / 1e6, output: 25 / 1e6 },
    "sarvam-105b": { input: 10 / 1e6, cached: 0.25 / 1e6, output: 25 / 1e6 },
    "claude-opus-5-5": { input: (4 * USD_INR) / 1e6, cached: (0.2 * USD_INR) / 1e6, output: (20 * USD_INR) / 1e6 },
    "claude-haiku-5-5": { input: (0.1 * USD_INR) / 1e6, cached: (0.01 * USD_INR) / 1e6, output: (0.5 * USD_INR) / 1e6 },
  } as Record<string, { input: number; cached: number; output: number }>,

  /**
   * LiveKit, per participant-minute. 0 while on the free Build plan.
   * On Ship ($50/month) overage is $0.0005/min: set LIVEKIT_PER_MINUTE_INR in the agent env.
   */
  livekitPerMinute: 0,
} as const;

export interface UsageTotals {
  /** Audio sent to speech-to-text. */
  sttAudioMs: number;
  /** Characters turned into speech. */
  ttsChars: number;
  llmInputTokens: number;
  llmCachedTokens: number;
  llmOutputTokens: number;
  llmRequests: number;
  /** Time the room was live (learner + tutor connected). */
  roomMs: number;
}

export interface CostBreakdown {
  stt: number;
  tts: number;
  llm: number;
  livekit: number;
  total: number;
}

export function emptyUsage(): UsageTotals {
  return { sttAudioMs: 0, ttsChars: 0, llmInputTokens: 0, llmCachedTokens: 0, llmOutputTokens: 0, llmRequests: 0, roomMs: 0 };
}

export function estimateCost(
  u: UsageTotals,
  models: { ttsModel: string; llmModel: string },
  livekitPerMinute: number = PRICES.livekitPerMinute,
): CostBreakdown {
  const stt = (u.sttAudioMs / 60000) * PRICES.sttPerMinute;
  const tts = u.ttsChars * (PRICES.ttsPerChar[models.ttsModel] ?? PRICES.ttsPerChar["bulbul:v3"]!);
  const p = PRICES.llmPerToken[models.llmModel] ?? PRICES.llmPerToken["sarvam-105b"]!;
  // Cached tokens are part of input tokens; bill them at the cached rate.
  const uncached = Math.max(0, u.llmInputTokens - u.llmCachedTokens);
  const llm = uncached * p.input + u.llmCachedTokens * p.cached + u.llmOutputTokens * p.output;
  // Two participants (learner + tutor) are connected for the whole room time.
  const livekit = (u.roomMs / 60000) * 2 * livekitPerMinute;
  const total = stt + tts + llm + livekit;
  return { stt, tts, llm, livekit, total };
}

/** One tutor session as recorded by the agent. Written as one JSON line; later lines for the same id replace earlier ones. */
export interface SessionUsageRecord {
  id: string;
  /** Per-device learner ID, or null for sessions from before IDs existed. */
  learnerId: string | null;
  status: "live" | "ended";
  startedAt: string;
  updatedAt: string;
  tutorLanguage: string;
  screenLanguage: string;
  llmProvider: string;
  llmModel: string;
  ttsModel: string;
  sttStreaming: boolean;
  learnerTurns: number;
  usage: UsageTotals;
  cost: CostBreakdown;
  /** Median time to the first word of an answer, ms. */
  medianLlmTtftMs: number | null;
}
