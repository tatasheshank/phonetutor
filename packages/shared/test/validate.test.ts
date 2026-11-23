import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { availableLanguages, getLanguage, isLanguageCode, validateLesson } from "../src";

const sample = JSON.parse(
  readFileSync(join(__dirname, "../../../content/lessons/wa-video-call-01.json"), "utf8"),
);

function reviewed(lesson: any, code: "te" | "hi" | "en") {
  const copy = structuredClone(lesson);
  copy.locales[code].status = "reviewed";
  copy.locales[code].reviewer = "test reviewer";
  return copy;
}

describe("language registry", () => {
  it("lists Telugu first", () => {
    expect(availableLanguages().map((l) => l.code)).toEqual(["te", "hi", "en"]);
  });

  it("rejects unknown codes", () => {
    expect(isLanguageCode("te")).toBe(true);
    expect(isLanguageCode("ta")).toBe(false);
    expect(isLanguageCode("toString")).toBe(false);
  });

  it("gives every language the same authored phrases", () => {
    const keys = Object.keys(getLanguage("te").phrases).sort();
    for (const l of availableLanguages()) {
      expect(Object.keys(l.phrases).sort()).toEqual(keys);
      for (const v of Object.values(l.phrases)) expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe("validateLesson", () => {
  it("draft-only sample is not playable", () => {
    const r = validateLesson(sample);
    expect(r.playableLanguages).toEqual([]);
    expect(r.ok).toBe(false);
  });

  it("a reviewed Telugu pack makes the lesson playable in Telugu only", () => {
    const r = validateLesson(reviewed(sample, "te"));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.playableLanguages).toEqual(["te"]);
  });

  it("all three reviewed packs are playable", () => {
    const r = validateLesson(reviewed(reviewed(reviewed(sample, "te"), "hi"), "en"));
    expect(r.ok).toBe(true);
    expect(r.playableLanguages).toEqual(["te", "hi", "en"]);
  });

  it("rejects a tap target that is not on the screen", () => {
    const bad = reviewed(sample, "te");
    bad.steps.find((s: { id: string }) => s.id === "s3").expect.tap = "btn.doesNotExist";
    const r = validateLesson(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain('no target "btn.doesNotExist"');
  });

  it("rejects an unknown screen", () => {
    const bad = reviewed(sample, "te");
    bad.screens.push("upi.home");
    expect(validateLesson(bad).errors.join("\n")).toContain('unknown screen "upi.home"');
  });

  it("rejects a reviewed pack that is missing a step", () => {
    const bad = reviewed(sample, "te");
    delete bad.locales.te.steps.s3;
    const r = validateLesson(bad);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("locales.te.steps.s3: missing");
  });

  it("rejects never-say phrases in any language", () => {
    const bad = reviewed(sample, "en");
    bad.locales.en.steps.s1.text = "Please share your OTP with me.";
    expect(validateLesson(bad).errors.join("\n")).toContain("never-say");
  });

  it("rejects duplicate step ids", () => {
    const bad = reviewed(sample, "te");
    bad.steps[1].id = "s1";
    expect(validateLesson(bad).errors.join("\n")).toContain('duplicate step id "s1"');
  });

  it("reports schema errors with paths", () => {
    const r = validateLesson({ id: "Bad Id" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith("id:"))).toBe(true);
  });
});

describe("validateLesson: classroom board videos", () => {
  // The sample lesson has no video step; add one to a copy.
  const withVideo = () => {
    const l = reviewed(sample, "en");
    l.steps.splice(2, 0, {
      id: "s2b",
      type: "video",
      src: "/lesson-media/wa-video-call-01/start-call.webm",
      poster: "/lesson-media/wa-video-call-01/start-call.png",
      cues: [
        { at: 0, point: { x: 0.75, y: 0.055 } },
        { at: 3, highlightBox: { x: 0.18, y: 0.17, w: 0.64, h: 0.32 } },
        { at: 6, point: { x: 0.833, y: 0.89 } },
      ],
    });
    l.locales.en.steps.s2b = {
      text: "First, let me show you on the board.",
      cues: [{ text: "Look here.", caption: "Camera = video call" }, { text: "Now it is calling." }, { text: "Press red to end." }],
    };
    return l;
  };
  const videoStep = (l: any) => l.steps.find((s: { type: string }) => s.type === "video");

  it("accepts the sample video step", () => {
    const r = validateLesson(withVideo(), { mediaExists: () => true });
    expect(r.errors).toEqual([]);
    expect(videoStep(r.lesson)).toMatchObject({ src: "/lesson-media/wa-video-call-01/start-call.webm" });
  });

  it("reports missing media files when a checker is given", () => {
    const r = validateLesson(withVideo(), { mediaExists: () => false });
    expect(r.errors.join("\n")).toContain('media file "/lesson-media/wa-video-call-01/start-call.webm" not found');
  });

  it("rejects cue times that don't go forward", () => {
    const bad = withVideo();
    videoStep(bad).cues[2].at = 1;
    expect(validateLesson(bad).errors.join("\n")).toContain('"at" must be later than the previous cue');
  });

  it("rejects media outside /lesson-media", () => {
    const bad = withVideo();
    videoStep(bad).src = "https://example.com/x.mp4";
    expect(validateLesson(bad).ok).toBe(false);
    videoStep(bad).src = "/lesson-media/../secret.mp4";
    expect(validateLesson(bad).ok).toBe(false);
    videoStep(bad).src = "/lesson-media/a/../../secret.mp4";
    expect(validateLesson(bad).errors.join("\n")).toContain('must not contain ".."');
  });

  it("needs narration for every cue in a reviewed pack", () => {
    const bad = withVideo();
    bad.locales.en.steps.s2b.cues.pop();
    expect(validateLesson(bad).errors).toContain("locales.en.steps.s2b: needs narration for each of the 3 cues");
  });

  it("checks never-say phrases in cue narration", () => {
    const bad = withVideo();
    bad.locales.en.steps.s2b.cues[0].text = "Now share your OTP with me.";
    expect(validateLesson(bad).errors.join("\n")).toContain("never-say");
  });
});
