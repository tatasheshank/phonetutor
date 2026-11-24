import { describe, expect, it } from "vitest";
import { emptyUsage, istDate, parseDailyCap, parseUsageLog, spentToday, summarizeUsage, type SessionUsageRecord } from "../src";

function rec(id: string, startedAt: string, total: number, extra: Partial<SessionUsageRecord> = {}): SessionUsageRecord {
  return {
    id,
    learnerId: "TEST-USER",
    status: "ended",
    startedAt,
    updatedAt: startedAt,
    tutorLanguage: "te",
    screenLanguage: "en",
    llmProvider: "sarvam",
    llmModel: "sarvam-105b-conversations",
    ttsModel: "bulbul:v4-flash",
    sttStreaming: false,
    learnerTurns: 2,
    usage: { ...emptyUsage(), roomMs: 120_000 },
    cost: { stt: total * 0.3, tts: total * 0.6, llm: total * 0.1, livekit: 0, total },
    medianLlmTtftMs: 500,
    ...extra,
  };
}

describe("parseUsageLog", () => {
  it("keeps the last line per session and skips bad lines", () => {
    const a1 = rec("a", "2026-11-23T05:00:00Z", 1);
    const a2 = { ...a1, status: "ended" as const, cost: { ...a1.cost, total: 2 } };
    const text = [JSON.stringify(a1), "{not json", JSON.stringify(a2), "", JSON.stringify(rec("b", "2026-11-23T06:00:00Z", 3))].join("\n");
    const out = parseUsageLog(text);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.id === "a")!.cost.total).toBe(2);
  });
});

describe("istDate", () => {
  it("uses India time, not UTC", () => {
    // 20:00 UTC on the 22nd is 01:30 IST on the 23rd.
    expect(istDate(new Date("2026-11-22T20:00:00Z"))).toBe("2026-11-23");
  });
});

describe("summarizeUsage", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const records = [
    rec("today-te", "2026-11-23T05:00:00Z", 2),
    rec("today-hi", "2026-11-23T06:00:00Z", 1, { tutorLanguage: "hi" }),
    rec("earlier-this-month", "2026-11-05T06:00:00Z", 4),
    rec("last-month", "2026-10-30T06:00:00Z", 8, { llmProvider: "anthropic" }),
  ];
  const s = summarizeUsage(records, now, 14);

  it("splits today, month and all time", () => {
    expect(s.today.total).toBe(3);
    expect(s.today.sessions).toBe(2);
    expect(s.month.total).toBe(7);
    expect(s.all.total).toBe(15);
  });

  it("averages cost per live minute", () => {
    expect(s.all.liveMinutes).toBe(8);
    expect(s.perLiveMinute).toBeCloseTo(15 / 8);
  });

  it("counts Sarvam spend without Claude answers", () => {
    // all speech (0.9 of each total) + Sarvam answers (0.1 of the first three)
    expect(s.sarvamSpend).toBeCloseTo(15 * 0.9 + 7 * 0.1);
  });

  it("groups by language, biggest first", () => {
    expect(s.byLanguage.map((l) => [l.language, l.total])).toEqual([
      ["te", 14],
      ["hi", 1],
    ]);
  });

  it("fills every day in the window, oldest first", () => {
    expect(s.byDay).toHaveLength(14);
    expect(s.byDay.at(-1)).toEqual({ date: "2026-11-23", total: 3, sessions: 2 });
    expect(s.byDay[0]!.date).toBe("2026-11-10");
  });

  it("lists recent sessions newest first", () => {
    expect(s.recent.map((r) => r.id)[0]).toBe("today-hi");
  });

  it("handles no data", () => {
    const e = summarizeUsage([], now);
    expect(e.all.total).toBe(0);
    expect(e.perLiveMinute).toBeNull();
  });
});

describe("daily cap", () => {
  it("parses the cap setting", () => {
    expect(parseDailyCap(undefined)).toBe(50);
    expect(parseDailyCap("")).toBe(50);
    expect(parseDailyCap("120")).toBe(120);
    expect(parseDailyCap("0")).toBeNull();
    expect(parseDailyCap("off")).toBeNull();
    expect(parseDailyCap("abc")).toBe(50);
    expect(parseDailyCap("-5")).toBe(50);
  });

  it("adds up only today's spend in India time", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    const records = [
      rec("a", "2026-11-23T05:00:00Z", 12),
      rec("b", "2026-11-22T20:00:00Z", 3), // 01:30 IST on the 23rd: today
      rec("c", "2026-11-22T10:00:00Z", 40), // yesterday
    ];
    expect(spentToday(records, now)).toBe(15);
  });
});
