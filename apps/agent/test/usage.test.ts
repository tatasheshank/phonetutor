import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dailyCapReached, UsageTracker, writeUsage } from "../src/usage";

const meta = {
  id: "tutor-1",
  tutorLanguage: "te",
  screenLanguage: "en",
  llmProvider: "sarvam",
  llmModel: "sarvam-105b-conversations",
  ttsModel: "bulbul:v4-flash",
  sttStreaming: false,
};

describe("UsageTracker", () => {
  it("adds up metrics and prices them", () => {
    const t = new UsageTracker(meta, 0, 0);
    t.add({ type: "stt_metrics", audioDurationMs: 20_000 });
    t.add({ type: "stt_metrics", audioDurationMs: 10_000 });
    t.add({ type: "tts_metrics", charactersCount: 300 });
    t.add({ type: "llm_metrics", promptTokens: 1000, promptCachedTokens: 400, completionTokens: 100, ttftMs: 500 });
    t.add({ type: "llm_metrics", promptTokens: 500, promptCachedTokens: 0, completionTokens: 50, ttftMs: 700 });
    t.add({ type: "vad_metrics" }); // ignored
    t.addLearnerTurn();

    const r = t.record("ended", 60_000);
    expect(r.usage).toMatchObject({
      sttAudioMs: 30_000,
      ttsChars: 300,
      llmInputTokens: 1500,
      llmCachedTokens: 400,
      llmOutputTokens: 150,
      llmRequests: 2,
      roomMs: 60_000,
    });
    expect(r.learnerTurns).toBe(1);
    expect(r.medianLlmTtftMs).toBe(700);
    expect(r.cost.stt).toBeCloseTo(0.245, 3);
    expect(r.cost.tts).toBeCloseTo(0.6, 3);
    expect(r.cost.total).toBeCloseTo(r.cost.stt + r.cost.tts + r.cost.llm, 6);
    expect(r.status).toBe("ended");
  });

  it("writes one JSON line per record", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "usage-")), "nested", "usage.jsonl");
    const t = new UsageTracker(meta, 0, 0);
    await writeUsage(t.record("live", 1000), path);
    await writeUsage(t.record("ended", 2000), path);
    const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.status)).toEqual(["live", "ended"]);
  });
});

describe("dailyCapReached", () => {
  it("compares today's total in the log with DAILY_SPEND_CAP_INR", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "cap-")), "usage.jsonl");
    const t = new UsageTracker(meta, 0, Date.now() - 60_000);
    t.add({ type: "tts_metrics", charactersCount: 10_000 }); // ₹20 on v4-flash
    await writeUsage(t.record("live"), path);

    process.env.DAILY_SPEND_CAP_INR = "50";
    expect((await dailyCapReached(path)).reached).toBe(false);
    process.env.DAILY_SPEND_CAP_INR = "15";
    const hit = await dailyCapReached(path);
    expect(hit.reached).toBe(true);
    expect(hit.spent).toBeCloseTo(20, 1);
    process.env.DAILY_SPEND_CAP_INR = "0";
    expect((await dailyCapReached(path)).reached).toBe(false);
    delete process.env.DAILY_SPEND_CAP_INR;
  });
});
