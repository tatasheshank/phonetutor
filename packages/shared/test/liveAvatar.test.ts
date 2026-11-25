import { describe, expect, it } from "vitest";
import { freeMinutesLeft, isLiveProviderId, LIVE_PROVIDERS, liveMonthKey, liveUsageKey, liveProvider } from "../src";

describe("live teacher: free only", () => {
  it("offers only services with a free allowance", () => {
    expect(LIVE_PROVIDERS.map((p) => p.id).sort()).toEqual(["bey", "tavus"]);
    expect(isLiveProviderId("lemonslice")).toBe(false); // no free plan
    expect(isLiveProviderId("anam")).toBe(false); // removed
    for (const p of LIVE_PROVIDERS) expect(p.freeMinutesPerMonth).toBeGreaterThan(0);
  });

  it("counts monthly services per India calendar month, and trials forever", () => {
    // 31 Oct 2026, 20:00 UTC is already 1 Nov in India.
    expect(liveMonthKey(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11");
    expect(liveMonthKey(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10");
    expect(liveUsageKey(liveProvider("tavus"), new Date("2026-11-25T10:00:00Z"))).toBe("2026-11");
    expect(liveUsageKey(liveProvider("bey"))).toBe("trial");
  });

  it("works out the free minutes left, never below zero", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    const usage = { minutes: { tavus: { "2026-11": 10, "2026-10": 99 }, bey: { trial: 40 } } };
    expect(freeMinutesLeft(usage, "tavus", now)).toBe(liveProvider("tavus").freeMinutesPerMonth - 10);
    expect(freeMinutesLeft(usage, "bey", now)).toBe(0); // trial used up: stays used up
    // A new month resets monthly services.
    expect(freeMinutesLeft(usage, "tavus", new Date("2026-12-02T10:00:00Z"))).toBe(liveProvider("tavus").freeMinutesPerMonth);
  });
});
