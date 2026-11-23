import { describe, expect, it } from "vitest";
import { emptyUsage, estimateCost } from "../src";

const sarvam = { ttsModel: "bulbul:v4-flash", llmModel: "sarvam-105b-conversations" };

describe("estimateCost", () => {
  it("is zero for no usage", () => {
    expect(estimateCost(emptyUsage(), sarvam).total).toBe(0);
  });

  it("prices one typical live minute at about a rupee on Sarvam only", () => {
    const u = {
      ...emptyUsage(),
      sttAudioMs: 30_000, // learner spoke for 30 s
      ttsChars: 300, // tutor said ~300 Telugu characters
      llmInputTokens: 1500,
      llmOutputTokens: 150,
      llmRequests: 3,
      roomMs: 60_000,
    };
    const c = estimateCost(u, sarvam);
    expect(c.stt).toBeCloseTo(0.245, 3);
    expect(c.tts).toBeCloseTo(0.6, 3);
    expect(c.llm).toBeCloseTo(0.015 + 0.00375, 5);
    expect(c.livekit).toBe(0);
    expect(c.total).toBeGreaterThan(0.8);
    expect(c.total).toBeLessThan(1.0);
  });

  it("bills cached input at the cached rate", () => {
    const u = { ...emptyUsage(), llmInputTokens: 1_000_000, llmCachedTokens: 1_000_000 };
    expect(estimateCost(u, sarvam).llm).toBeCloseTo(0.25, 5);
  });

  it("charges V3 voices more than V4 Flash", () => {
    const u = { ...emptyUsage(), ttsChars: 1000 };
    expect(estimateCost(u, { ...sarvam, ttsModel: "bulbul:v3" }).tts).toBeCloseTo(3);
    expect(estimateCost(u, sarvam).tts).toBeCloseTo(2);
  });

  it("counts LiveKit for both participants when a per-minute price is set", () => {
    const u = { ...emptyUsage(), roomMs: 10 * 60_000 };
    expect(estimateCost(u, sarvam, 0.0425).livekit).toBeCloseTo(0.85, 5);
  });

  it("falls back to known prices for unknown models", () => {
    const u = { ...emptyUsage(), ttsChars: 1000, llmOutputTokens: 1_000_000 };
    const c = estimateCost(u, { ttsModel: "bulbul:v9", llmModel: "mystery" });
    expect(c.tts).toBeCloseTo(3);
    expect(c.llm).toBeCloseTo(25);
  });
});
