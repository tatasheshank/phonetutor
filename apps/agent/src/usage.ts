import {
  emptyUsage,
  parseDailyCap,
  parseUsageLog,
  spentToday,
  estimateCost,
  type SessionUsageRecord,
  type UsageTotals,
} from "@ai-tutor/shared";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The subset of LiveKit metrics we bill on. Kept structural so tests don't need LiveKit. */
export type BillableMetrics =
  | { type: "stt_metrics"; audioDurationMs: number }
  | { type: "tts_metrics"; charactersCount: number }
  | { type: "llm_metrics"; promptTokens: number; promptCachedTokens: number; completionTokens: number; ttftMs: number }
  | { type: string };

export interface SessionMeta {
  id: string;
  learnerId?: string;
  tutorLanguage: string;
  screenLanguage: string;
  llmProvider: string;
  llmModel: string;
  ttsModel: string;
  sttStreaming: boolean;
}

/** Adds up one session's usage from LiveKit metrics events and prices it. */
export class UsageTracker {
  readonly usage: UsageTotals = emptyUsage();
  private readonly ttfts: number[] = [];
  private learnerTurns = 0;
  private readonly startedAt: number;

  constructor(
    private readonly meta: SessionMeta,
    private readonly livekitPerMinute = Number(process.env.LIVEKIT_PER_MINUTE_INR || 0),
    now = Date.now(),
  ) {
    this.startedAt = now;
  }

  add(m: BillableMetrics): void {
    if (m.type === "stt_metrics" && "audioDurationMs" in m) {
      this.usage.sttAudioMs += m.audioDurationMs || 0;
    } else if (m.type === "tts_metrics" && "charactersCount" in m) {
      this.usage.ttsChars += m.charactersCount || 0;
    } else if (m.type === "llm_metrics" && "promptTokens" in m) {
      this.usage.llmInputTokens += m.promptTokens || 0;
      this.usage.llmCachedTokens += m.promptCachedTokens || 0;
      this.usage.llmOutputTokens += m.completionTokens || 0;
      this.usage.llmRequests += 1;
      if (m.ttftMs > 0) this.ttfts.push(m.ttftMs);
    }
  }

  addLearnerTurn(): void {
    this.learnerTurns += 1;
  }

  record(status: "live" | "ended", now = Date.now()): SessionUsageRecord {
    const usage = { ...this.usage, roomMs: now - this.startedAt };
    const sorted = [...this.ttfts].sort((a, b) => a - b);
    return {
      id: this.meta.id,
      learnerId: this.meta.learnerId ?? null,
      status,
      startedAt: new Date(this.startedAt).toISOString(),
      updatedAt: new Date(now).toISOString(),
      tutorLanguage: this.meta.tutorLanguage,
      screenLanguage: this.meta.screenLanguage,
      llmProvider: this.meta.llmProvider,
      llmModel: this.meta.llmModel,
      ttsModel: this.meta.ttsModel,
      sttStreaming: this.meta.sttStreaming,
      learnerTurns: this.learnerTurns,
      usage,
      cost: estimateCost(usage, this.meta, this.livekitPerMinute),
      medianLlmTtftMs: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null,
    };
  }
}

/**
 * Where usage records go. One JSON object per line; the dashboard keeps the last line per session id.
 * TODO(M4): write to the Postgres lesson_runs table instead, so the dashboard works when deployed.
 */
export function usageLogPath(): string {
  if (process.env.USAGE_LOG_PATH) return resolve(process.env.USAGE_LOG_PATH);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  return resolve(repoRoot, "data/usage.jsonl");
}

export async function writeUsage(record: SessionUsageRecord, path = usageLogPath()): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    // Never let cost logging break a lesson.
    console.warn("[usage] could not write usage record", err);
  }
}

/**
 * True when today's estimated AI spend (all sessions, including this one's latest snapshot)
 * has reached DAILY_SPEND_CAP_INR (default ₹50; "0" = no cap).
 */
export async function dailyCapReached(path = usageLogPath()): Promise<{ reached: boolean; spent: number; cap: number | null }> {
  const cap = parseDailyCap(process.env.DAILY_SPEND_CAP_INR);
  if (cap === null) return { reached: false, spent: 0, cap };
  try {
    const spent = spentToday(parseUsageLog(await readFile(path, "utf8")));
    return { reached: spent >= cap, spent, cap };
  } catch {
    return { reached: false, spent: 0, cap };
  }
}
