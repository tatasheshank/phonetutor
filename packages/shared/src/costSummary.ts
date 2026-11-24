import type { SessionUsageRecord } from "./costs";

export interface CostTotals {
  sessions: number;
  liveMinutes: number;
  learnerTurns: number;
  stt: number;
  tts: number;
  llm: number;
  livekit: number;
  total: number;
}

export interface CostSummary {
  today: CostTotals;
  month: CostTotals;
  all: CostTotals;
  /** Average cost per live minute across all sessions, or null with no usage. */
  perLiveMinute: number | null;
  /** Spend billed by Sarvam (all speech, plus answers when Sarvam is the LLM). Counts against Sarvam credit. */
  sarvamSpend: number;
  byLanguage: Array<{ language: string } & CostTotals>;
  /** Last `days` days in IST, oldest first, including days with no usage. */
  byDay: Array<{ date: string; total: number; sessions: number }>;
  /** Newest first. */
  recent: SessionUsageRecord[];
}

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in India time, so "today" matches the learner's day. */
export function istDate(d: Date): string {
  return IST_DAY.format(d);
}

function zero(): CostTotals {
  return { sessions: 0, liveMinutes: 0, learnerTurns: 0, stt: 0, tts: 0, llm: 0, livekit: 0, total: 0 };
}

function addTo(t: CostTotals, r: SessionUsageRecord): void {
  t.sessions += 1;
  t.liveMinutes += r.usage.roomMs / 60000;
  t.learnerTurns += r.learnerTurns;
  t.stt += r.cost.stt;
  t.tts += r.cost.tts;
  t.llm += r.cost.llm;
  t.livekit += r.cost.livekit;
  t.total += r.cost.total;
}

/** Parses the JSONL usage log. Later lines for the same session id replace earlier ones; bad lines are skipped. */
export function parseUsageLog(text: string): SessionUsageRecord[] {
  const byId = new Map<string, SessionUsageRecord>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as SessionUsageRecord;
      if (r && typeof r.id === "string" && r.cost && r.usage) byId.set(r.id, r);
    } catch {
      // skip partial or corrupt lines (e.g. a crash mid-write)
    }
  }
  return [...byId.values()];
}

export function summarizeUsage(records: SessionUsageRecord[], now = new Date(), days = 14): CostSummary {
  const todayKey = istDate(now);
  const monthKey = todayKey.slice(0, 7);
  const today = zero();
  const month = zero();
  const all = zero();
  const langs = new Map<string, CostTotals>();
  const dayTotals = new Map<string, { total: number; sessions: number }>();
  let sarvamSpend = 0;

  for (const r of records) {
    const day = istDate(new Date(r.startedAt));
    addTo(all, r);
    if (day === todayKey) addTo(today, r);
    if (day.startsWith(monthKey)) addTo(month, r);

    const lang = langs.get(r.tutorLanguage) ?? zero();
    addTo(lang, r);
    langs.set(r.tutorLanguage, lang);

    const d = dayTotals.get(day) ?? { total: 0, sessions: 0 };
    d.total += r.cost.total;
    d.sessions += 1;
    dayTotals.set(day, d);

    sarvamSpend += r.cost.stt + r.cost.tts + (r.llmProvider === "sarvam" ? r.cost.llm : 0);
  }

  const byDay: CostSummary["byDay"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = istDate(new Date(now.getTime() - i * 86_400_000));
    const d = dayTotals.get(date) ?? { total: 0, sessions: 0 };
    byDay.push({ date, ...d });
  }

  return {
    today,
    month,
    all,
    perLiveMinute: all.liveMinutes > 0 ? all.total / all.liveMinutes : null,
    sarvamSpend,
    byLanguage: [...langs.entries()]
      .map(([language, t]) => ({ language, ...t }))
      .sort((a, b) => b.total - a.total),
    byDay,
    recent: [...records].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  };
}

/** Default daily AI spend cap (₹) when none is configured. Protects demo credit. */
export const DEFAULT_DAILY_CAP_INR = 50;

/**
 * Reads DAILY_SPEND_CAP_INR. Unset or invalid = the default cap; "0" or "off" = no cap.
 * Returns the cap in ₹, or null for no cap.
 */
export function parseDailyCap(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return DEFAULT_DAILY_CAP_INR;
  if (/^(0|off|none)$/i.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP_INR;
}

/** Estimated AI spend so far today (India time), including sessions still running. */
export function spentToday(records: SessionUsageRecord[], now = new Date()): number {
  const today = istDate(now);
  return records.filter((r) => istDate(new Date(r.startedAt)) === today).reduce((sum, r) => sum + r.cost.total, 0);
}
