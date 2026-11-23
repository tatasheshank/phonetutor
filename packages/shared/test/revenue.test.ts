import { describe, expect, it } from "vitest";
import { emptyUsage, summarizeRevenue, type SessionUsageRecord } from "../src";

function session(id: string, learnerId: string | null, cost: number, minutes = 5, at = "2026-11-23T05:00:00Z"): SessionUsageRecord {
  return {
    id,
    learnerId,
    status: "ended",
    startedAt: at,
    updatedAt: at,
    tutorLanguage: "te",
    screenLanguage: "en",
    llmProvider: "sarvam",
    llmModel: "sarvam-105b-conversations",
    ttsModel: "bulbul:v4-flash",
    sttStreaming: false,
    learnerTurns: 3,
    usage: { ...emptyUsage(), roomMs: minutes * 60000 },
    cost: { stt: 0, tts: cost, llm: 0, livekit: 0, total: cost },
    medianLlmTtftMs: 500,
  };
}

const users = [
  { id: "AAAA-AAAA", name: "Lakshmi", createdAt: "2026-11-01T00:00:00Z", isTest: false },
  { id: "BBBB-BBBB", name: null, createdAt: "2026-11-02T00:00:00Z", isTest: false },
  { id: "CCCC-CCCC", name: "Ravi", createdAt: "2026-11-03T00:00:00Z", isTest: false },
  { id: "TEST-TEST", name: "Tester", createdAt: "2026-11-03T00:00:00Z", isTest: true },
];
const sessions = [
  session("s1", "AAAA-AAAA", 10),
  session("s2", "AAAA-AAAA", 5),
  session("s3", "BBBB-BBBB", 3),
  session("s4", "TEST-TEST", 4),
  session("s5", null, 2),
];
const payments = [
  { userId: "AAAA-AAAA", amountInr: 99, paidAt: "2026-11-23T06:00:00Z", provider: "razorpay" },
  { userId: "CCCC-CCCC", amountInr: 99, paidAt: "2026-11-02T06:00:00Z", provider: "razorpay" },
  { userId: "TEST-TEST", amountInr: 99, paidAt: "2026-11-23T06:00:00Z", provider: "test" },
];
const s = summarizeRevenue(sessions, payments, users, new Date("2026-11-23T10:00:00Z"));

describe("summarizeRevenue", () => {
  it("counts only real payments as revenue", () => {
    expect(s.revenue).toEqual({ today: 99, month: 198, all: 198 });
    expect(s.testRevenue).toBe(99);
    expect(s.payments).toBe(2);
  });

  it("counts real users and paying users", () => {
    expect(s.users).toBe(3);
    expect(s.payingUsers).toBe(2);
  });

  it("works out revenue, cost and profit per user", () => {
    expect(s.revenuePerUser).toBeCloseTo(66);
    expect(s.revenuePerPayingUser).toBeCloseTo(99);
    expect(s.costPerUser).toBeCloseTo((10 + 5 + 3) / 3);
    expect(s.profitPerUser).toBeCloseTo((198 - 18) / 3);
  });

  it("uses all costs, including test and unattributed, for overall profit", () => {
    expect(s.totalCost).toBe(24);
    expect(s.profit).toBe(174);
    expect(s.margin).toBeCloseTo(174 / 198);
    expect(s.unattributed).toEqual({ sessions: 1, cost: 2 });
  });

  it("builds a per-user table including test users", () => {
    const a = s.perUser.find((r) => r.userId === "AAAA-AAAA")!;
    expect(a).toMatchObject({ name: "Lakshmi", sessions: 2, cost: 15, revenue: 99, profit: 84, paid: true });
    expect(s.perUser.find((r) => r.userId === "TEST-TEST")!.isTest).toBe(true);
    expect(s.perUser.find((r) => r.userId === "CCCC-CCCC")).toMatchObject({ sessions: 0, revenue: 99 });
  });

  it("handles no users", () => {
    const e = summarizeRevenue([], [], []);
    expect(e.revenuePerUser).toBeNull();
    expect(e.costPerUser).toBeNull();
    expect(e.margin).toBeNull();
  });
});
