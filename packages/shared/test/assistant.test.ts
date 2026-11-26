import { describe, expect, it } from "vitest";
import { cueTimes, isFreeLicence, lessonSchema, parseIsoDuration, pickedIndex, pictureCredit, placeStepAfter } from "../src";

const lesson = lessonSchema.parse({
  id: "a-1",
  version: 1,
  course: "x",
  mode: "scripted",
  objectives: ["x"],
  screens: [],
  interruptions: { enabled: true, maxLiveTurns: 8, maxLiveSeconds: 180 },
  steps: [
    { id: "s1", type: "say" },
    { id: "s2", type: "say" },
    { id: "s3", type: "say" },
    { id: "s4", type: "video", source: { kind: "youtube", videoId: "abcdefghijk" }, cues: [{ at: 0 }] },
    { id: "s5", type: "check", tapFallback: ["yes", "no"] },
  ],
  safety: { neverSay: [] },
  locales: {},
});

describe("lesson assistant helpers", () => {
  it("places a step right after another", () => {
    expect(placeStepAfter(lesson, "s4", "s1").steps.map((s) => s.id)).toEqual(["s1", "s4", "s2", "s3", "s5"]);
    expect(placeStepAfter(lesson, "s4", "s3").steps.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(placeStepAfter(lesson, "s1", "s3").steps.map((s) => s.id)).toEqual(["s2", "s3", "s1", "s4", "s5"]);
    expect(placeStepAfter(lesson, "s4", "nope").steps.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  it("spaces cues through the start of the video and never past its end", () => {
    expect(cueTimes(3, 300)).toEqual([0, 22, 44]);
    expect(cueTimes(3, null)).toEqual([0, 22, 44]);
    const short = cueTimes(4, 30);
    expect(short[0]).toBe(0);
    expect(Math.max(...short)).toBeLessThan(30);
    expect(cueTimes(0, 100)).toEqual([0]);
  });

  it("reads YouTube durations", () => {
    expect(parseIsoDuration("PT4M13S")).toBe(253);
    expect(parseIsoDuration("PT1H2M")).toBe(3720);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1D")).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });

  it("accepts only free licences", () => {
    for (const ok of ["Public domain", "CC0", "CC BY 4.0", "CC BY-SA 3.0", "CC-BY-SA-4.0", "GODL-India", "PD-US"]) expect(isFreeLicence(ok), ok).toBe(true);
    for (const bad of ["CC BY-NC 4.0", "CC BY-NC-SA 2.0", "CC BY-ND 4.0", "Fair use", "", null, "Copyrighted"]) expect(isFreeLicence(bad), String(bad)).toBe(false);
  });

  it("writes a clean credit line", () => {
    expect(pictureCredit('<a href="x">Jean-Pierre Houël</a>', "Public domain")).toBe("Jean-Pierre Houël · Public domain · Wikimedia Commons");
    expect(pictureCredit("Unknown authorUnknown author", "Public domain")).toBe("Public domain · Wikimedia Commons");
    expect(pictureCredit("Elliott &amp; Fry", "PD")).toBe("Elliott & Fry · PD · Wikimedia Commons");
  });

  it("checks the AI's choice", () => {
    expect(pickedIndex(2, 5)).toBe(1);
    expect(pickedIndex("1", 5)).toBe(0);
    expect(pickedIndex(0, 5)).toBeNull();
    expect(pickedIndex(6, 5)).toBeNull();
    expect(pickedIndex("x", 5)).toBeNull();
  });
});
