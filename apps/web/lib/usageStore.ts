import "server-only";
import { parseDailyCap, parseUsageLog, spentToday, type SessionUsageRecord } from "@ai-tutor/shared";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Reads the usage log the agent worker writes (data/usage.jsonl at the repo root).
 * Works while the agent and web app run on the same machine.
 * TODO(M4): read from Postgres (lesson_runs) so this works when the web app is deployed.
 */
export function usageLogPath(): string {
  if (process.env.USAGE_LOG_PATH) return resolve(process.env.USAGE_LOG_PATH);
  // `next dev` runs with cwd = apps/web
  return resolve(process.cwd(), "../../data/usage.jsonl");
}

export async function loadUsage(): Promise<{ records: SessionUsageRecord[]; path: string; found: boolean }> {
  const path = usageLogPath();
  try {
    return { records: parseUsageLog(await readFile(/* turbopackIgnore: true */ path, "utf8")), path, found: true };
  } catch {
    return { records: [], path, found: false };
  }
}

/** Live tutoring minutes this learner has used so far (all sessions). */
export async function liveMinutesUsed(learnerId: string): Promise<number> {
  const { records } = await loadUsage();
  return records.filter((r) => r.learnerId === learnerId).reduce((sum, r) => sum + r.usage.roomMs / 60000, 0);
}

/** Today's estimated AI spend against the daily cap (DAILY_SPEND_CAP_INR, default ₹50; "0" = no cap). */
export async function dailyCapStatus(): Promise<{ cap: number | null; spent: number; reached: boolean }> {
  const cap = parseDailyCap(process.env.DAILY_SPEND_CAP_INR);
  const { records } = await loadUsage();
  const spent = spentToday(records);
  return { cap, spent, reached: cap !== null && spent >= cap };
}
