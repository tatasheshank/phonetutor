import { describe, expect, it } from "vitest";
import {
  appendVideoStep,
  byClipName,
  lessonFromPlan,
  lessonPlanSchema,
  locateMedia,
  markPacksDraft,
  mergeTranslatedPack,
  missingNarration,
  moveStep,
  parseRange,
  removeStep,
  setVideoCues,
  uploadedMediaUrl,
  validateLesson,
  videoLessonFromPlan,
  videoPlanSchema,
  parseYouTubeId,
  LessonRunner,
  getLanguage,
  type Lesson,
} from "../src";

describe("lesson media paths", () => {
  it("accepts uploaded and hand-placed media, nothing else", () => {
    expect(locateMedia("/api/lesson-media/excel-1/clip-s2.mp4")).toEqual({ root: "uploads", lessonId: "excel-1", file: "clip-s2.mp4" });
    expect(locateMedia("/lesson-media/wa/start.webm")).toEqual({ root: "public", path: "/lesson-media/wa/start.webm" });
    for (const bad of [
      "/api/lesson-media/../secret/clip.mp4",
      "/api/lesson-media/x/../../etc.mp4",
      "/api/lesson-media/x/sub/clip.mp4",
      "/api/lesson-media/X/clip.mp4",
      "/api/lesson-media/x/clip.exe",
      "/api/lesson-media/x/.hidden.mp4",
      "/lesson-media/a\\b.mp4",
      "https://evil.example/clip.mp4",
    ]) {
      expect(locateMedia(bad), bad).toBeNull();
    }
  });

  it("builds upload URLs only from safe names", () => {
    expect(uploadedMediaUrl("excel-1", "clip-s3.webm")).toBe("/api/lesson-media/excel-1/clip-s3.webm");
    expect(() => uploadedMediaUrl("excel-1", "../x.mp4")).toThrow();
    expect(() => uploadedMediaUrl("Excel", "clip.mp4")).toThrow();
  });

  it("orders clips the way people number them", () => {
    expect(["10 save.mp4", "2 type.mp4", "01 open.mp4"].sort(byClipName)).toEqual(["01 open.mp4", "2 type.mp4", "10 save.mp4"]);
  });

  it("parses HTTP Range headers for video seeking", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-", 1000)).toEqual([0, 999]);
    expect(parseRange("bytes=100-199", 1000)).toEqual([100, 199]);
    expect(parseRange("bytes=900-5000", 1000)).toEqual([900, 999]);
    expect(parseRange("bytes=-100", 1000)).toEqual([900, 999]);
    expect(parseRange("bytes=1000-", 1000)).toBe("invalid");
    expect(parseRange("bytes=5-2", 1000)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull(); // multi-range: whole file
  });
});

const clips = ["01 open excel.mp4", "02 type numbers.mp4", "03 autosum.webm"].map((name, i) => ({
  label: name,
  duration: [20, 30, 15][i]!,
  src: (stepId: string) => uploadedMediaUrl("excel-sum", `clip-${stepId}.${name.endsWith(".webm") ? "webm" : "mp4"}`),
}));

describe("videoLessonFromPlan", () => {
  it("builds a board-video lesson with no phone screens", () => {
    const plan = videoPlanSchema.parse({
      title: "Add numbers in Excel",
      steps: [
        { kind: "explain", text: "Today we add numbers in Excel." },
        { kind: "clip", clip: 1, intro: "First, open Excel.", cues: [{ at: 0, text: "I click the green Excel icon." }] },
        { kind: "clip", clip: 2, cues: [{ at: 12, text: "Now I type 20." }, { at: 0, text: "I click cell A1 and type 10." }] },
        { kind: "clip", clip: 3, cues: [{ at: 99, text: "I press AutoSum." }] },
        { kind: "check", question: "Did you understand how to add numbers?", accept: ["haan ji"] },
      ],
    });
    const { lesson, warnings } = videoLessonFromPlan(plan, "excel-sum", clips, "Excel basics");
    expect(warnings).toEqual([]);
    expect(lesson.screens).toEqual([]);
    expect(lesson.course).toBe("excel-basics");
    expect(lesson.steps.map((s) => s.type)).toEqual(["say", "video", "video", "video", "check"]);
    const [, v1, v2, v3] = lesson.steps as Array<Extract<Lesson["steps"][number], { type: "video" }>>;
    expect((v1!.source as { src: string }).src).toBe("/api/lesson-media/excel-sum/clip-s2.mp4");
    expect((v3!.source as { src: string }).src).toBe("/api/lesson-media/excel-sum/clip-s4.webm");
    // Cues sorted by time, first at 0, times kept inside the clip.
    expect(v2!.cues.map((c) => c.at)).toEqual([0, 12]);
    expect(lesson.locales.en!.steps.s3!.cues!.map((c) => c.text)).toEqual(["I click cell A1 and type 10.", "Now I type 20."]);
    expect(v3!.cues[0]!.at).toBe(0);
    expect(lesson.locales.en!.steps.s2!.text).toBe("First, open Excel.");
    expect(lesson.locales.en!.steps.s5!.accept).toContain("haan ji");
    expect(validateLesson(lesson).errors).toEqual(["locales: a scripted lesson needs at least one reviewed locale pack"]);
  });

  it("uses every clip once, in order, even when the plan skips or repeats some", () => {
    const plan = videoPlanSchema.parse({
      title: "Excel",
      steps: [
        { kind: "clip", clip: 2, cues: [{ text: "Typing." }] },
        { kind: "clip", clip: 2, cues: [{ text: "Again." }] },
        { kind: "clip", clip: 9, cues: [{ text: "No such clip." }] },
        { kind: "screen", text: "odd kind becomes explain" },
      ],
    });
    const { lesson, warnings } = videoLessonFromPlan(plan, "excel-sum", clips);
    const videos = lesson.steps.filter((s) => s.type === "video") as Array<Extract<Lesson["steps"][number], { type: "video" }>>;
    expect(videos.map((v) => v.label)).toEqual(["01 open excel.mp4", "02 type numbers.mp4", "03 autosum.webm"]);
    expect(warnings.join("\n")).toContain("planned twice");
    expect(warnings.join("\n")).toContain("clip 9");
    expect(warnings.join("\n")).toContain("no narration");
    expect(lesson.steps.some((s) => s.type === "show" || s.type === "practice")).toBe(false);
    expect(lesson.steps.at(-1)!.type).toBe("check");
  });

  it("spreads cues without times over the clip", () => {
    const plan = videoPlanSchema.parse({ title: "T", steps: [{ kind: "clip", clip: 1, cues: [{ text: "a" }, { text: "b" }, { text: "c" }] }] });
    const { lesson } = videoLessonFromPlan(plan, "x", clips.slice(0, 1));
    const v = lesson.steps.find((s) => s.type === "video") as Extract<Lesson["steps"][number], { type: "video" }>;
    expect(v.cues.map((c) => c.at)).toEqual([0, 6.6, 13.2]);
  });

  it("translates cue narration cue by cue, falling back to English", () => {
    const plan = videoPlanSchema.parse({ title: "T", steps: [{ kind: "clip", clip: 1, cues: [{ at: 0, text: "One." }, { at: 5, text: "Two." }] }] });
    const en = videoLessonFromPlan(plan, "x", clips.slice(0, 1)).lesson.locales.en!;
    const { pack, warnings } = mergeTranslatedPack(en, { steps: { s1: { cues: [{ text: "ఒకటి." }] } } }, "te");
    expect(pack.steps.s1!.cues).toEqual([{ text: "ఒకటి." }, { text: "Two." }]);
    expect(warnings[0]).toContain("2 line(s)"); // the cue and the untranslated check question
  });
});

function phoneLesson(): Lesson {
  const plan = lessonPlanSchema.parse({ title: "T", steps: [{ kind: "explain", text: "Hello." }] });
  const lesson = lessonFromPlan(plan, "edit-me").lesson;
  lesson.locales.te = { ...structuredClone(lesson.locales.en!), status: "reviewed", reviewer: "a" };
  return lesson;
}

describe("editing video steps", () => {
  it("adds a clip step before the final question, with empty narration everywhere", () => {
    const { lesson, stepId } = appendVideoStep(phoneLesson(), { source: { kind: "upload", src: "/api/lesson-media/edit-me/clip-s3.mp4" }, label: "01 open.mp4" });
    expect(stepId).toBe("s3");
    expect(lesson.steps.map((s) => s.id)).toEqual(["s1", "s3", "s2"]);
    expect(lesson.locales.te!.steps.s3).toEqual({ cues: [{ text: "" }] });
    expect(missingNarration(lesson)).toEqual([
      { stepId: "s3", lang: "te", cue: 0 },
      { stepId: "s3", lang: "en", cue: 0 },
    ]);
  });

  it("saves cues sorted, strictly increasing and clamped to the frame", () => {
    const { lesson, stepId } = appendVideoStep(phoneLesson(), { source: { kind: "upload", src: "/api/lesson-media/edit-me/clip-s3.mp4" } });
    const out = setVideoCues(
      lesson,
      stepId,
      [
        { at: 5, point: { x: 1.4, y: -0.2 }, text: { en: "  Second. ", te: "రెండు" } },
        { at: 5, highlightBox: { x: 0.8, y: 0.1, w: 0.5, h: 0.2 }, text: { en: "Third." } },
        { at: 0, text: { en: "First." } },
      ],
      { en: "Watch me.", te: "" },
    );
    const step = out.steps.find((s) => s.id === stepId) as Extract<Lesson["steps"][number], { type: "video" }>;
    expect(step.cues.map((c) => c.at)).toEqual([0, 5, 5.1]);
    expect(step.cues[1]!.point).toEqual({ x: 1, y: 0 });
    expect(step.cues[2]!.highlightBox).toEqual({ x: 0.8, y: 0.1, w: 0.2, h: 0.2 });
    expect(out.locales.en!.steps[stepId]).toEqual({ text: "Watch me.", cues: [{ text: "First." }, { text: "Second." }, { text: "Third." }] });
    expect(out.locales.te!.steps[stepId]!.cues!.map((c) => c.text)).toEqual(["", "రెండు", ""]);
    expect(validateLesson(out).errors.filter((e) => !e.startsWith("locales"))).toEqual([]);
  });

  it("rejects edits to steps that aren't videos, and empty cue lists", () => {
    const lesson = phoneLesson();
    expect(() => setVideoCues(lesson, "s1", [{ at: 0, text: {} }])).toThrow();
    const { lesson: l2, stepId } = appendVideoStep(lesson, { source: { kind: "upload", src: "/api/lesson-media/edit-me/clip-s3.mp4" } });
    expect(() => setVideoCues(l2, stepId, [])).toThrow();
  });

  it("removes and moves steps, and puts edited lessons back to draft", () => {
    const { lesson, stepId } = appendVideoStep(phoneLesson(), { source: { kind: "upload", src: "/api/lesson-media/edit-me/clip-s3.mp4" } });
    expect(moveStep(lesson, stepId, -1).steps.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    const removed = removeStep(lesson, stepId);
    expect(removed.steps.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(removed.locales.te!.steps[stepId]).toBeUndefined();
    const draft = markPacksDraft(lesson);
    expect(draft.locales.te!.status).toBe("draft");
    expect(draft.locales.te!.reviewer).toBeUndefined();
  });

  it("refuses unsafe media paths in a lesson", () => {
    const { lesson } = appendVideoStep(phoneLesson(), { source: { kind: "upload", src: "/api/lesson-media/../x.mp4" } });
    expect(validateLesson(lesson).ok).toBe(false);
  });
});

describe("YouTube video sources", () => {
  it("reads the video id from every common link form", () => {
    const id = "dQw4w9WgXcQ";
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
      `https://m.youtube.com/watch?v=${id}`,
      `youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}?rel=0`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      id,
    ]) {
      expect(parseYouTubeId(url), url).toBe(id);
    }
    for (const bad of ["https://vimeo.com/123", "https://youtube.com/watch?v=short", "https://evil.com/watch?v=dQw4w9WgXcQ", "", "not a link"]) {
      expect(parseYouTubeId(bad), bad).toBeNull();
    }
  });

  it("validates a YouTube step without looking for files, and rejects bad ids", () => {
    const { lesson } = appendVideoStep(phoneLesson(), { source: { kind: "youtube", videoId: "dQw4w9WgXcQ" }, label: "Excel intro" });
    let asked = 0;
    const ok = validateLesson(lesson, { mediaExists: () => (asked++, false) });
    expect(ok.errors.filter((e) => !e.startsWith("locales"))).toEqual([]);
    expect(asked).toBe(0);
    const bad = structuredClone(lesson);
    (bad.steps.find((s) => s.type === "video") as { source: { videoId: string } }).source.videoId = "https://youtu.be/x";
    expect(validateLesson(bad).errors.join("\n")).toContain("11-character YouTube id");
  });

  it("plays YouTube steps through the same board events", () => {
    const { lesson, stepId } = appendVideoStep(phoneLesson(), { source: { kind: "youtube", videoId: "dQw4w9WgXcQ" } });
    const filled = setVideoCues(lesson, stepId, [{ at: 3, text: { en: "Look here.", te: "ఇక్కడ చూడండి." } }]);
    const pack = filled.locales.en!;
    const actions = new LessonRunner(filled, pack, getLanguage("en")).start();
    const events = actions.flatMap((a) => (a.kind === "event" ? [a.event] : a.kind === "say" ? (a.events ?? []) : []));
    expect(events.find((e) => e.type === "board_video")).toMatchObject({ source: { kind: "youtube", videoId: "dQw4w9WgXcQ" } });
    expect(events.find((e) => e.type === "board_cue")).toMatchObject({ at: 3 });
  });

  it("upgrades lessons saved with the old src/poster fields", () => {
    const { lesson } = appendVideoStep(phoneLesson(), { source: { kind: "upload", src: "/lesson-media/a/b.mp4", poster: "/lesson-media/a/b.png" } });
    const old = structuredClone(lesson) as unknown as { steps: Array<Record<string, unknown>> };
    const v = old.steps.find((s) => s.type === "video")!;
    delete v.source;
    Object.assign(v, { src: "/lesson-media/a/b.mp4", poster: "/lesson-media/a/b.png" });
    const r = validateLesson(old);
    expect(r.lesson!.steps.find((s) => s.type === "video")).toMatchObject({
      source: { kind: "upload", src: "/lesson-media/a/b.mp4", poster: "/lesson-media/a/b.png" },
    });
    expect(r.lesson!.steps.find((s) => s.type === "video")).not.toHaveProperty("src");
  });
});

describe("lessons without clips", () => {
  it("drops invented talk about clips and screens, keeping the real content", () => {
    const plan = videoPlanSchema.parse({
      title: "Respiration",
      steps: [
        { kind: "explain", text: "Respiration releases energy from food. Now I play the first clip. The green Excel icon is at the top left." },
        { kind: "clip", clip: 1, intro: "Now I play clip 1.", cues: [{ text: "Look at the diagram. Glucose is broken down in the cells." }] },
        { kind: "explain", text: "This clip shows the lungs." },
      ],
    });
    const { lesson } = videoLessonFromPlan(plan, "resp", []);
    const said = Object.values(lesson.locales.en!.steps).map((s) => s.text ?? s.question ?? "");
    expect(said.join(" ")).not.toMatch(/clip|excel|icon|diagram/i);
    expect(said).toContain("Respiration releases energy from food.");
    expect(said).toContain("Glucose is broken down in the cells.");
    // The step that was only screen talk is gone; the check stays.
    expect(lesson.steps.map((s) => s.type)).toEqual(["say", "say", "check"]);
  });
});
