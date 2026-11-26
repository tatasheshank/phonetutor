import { describe, expect, it } from "vitest";
import {
  getLanguage,
  lessonSchema,
  LessonRunner,
  repairSlides,
  setSlides,
  setStepImage,
  slideLines,
  slidePlanSchema,
  slidesFromLines,
  talkSteps,
  validateLesson,
  type AgentEvent,
  type Lesson,
} from "../src";

function talkLesson(): Lesson {
  return lessonSchema.parse({
    id: "talk-1",
    version: 1,
    course: "history-and-civics",
    mode: "scripted",
    objectives: ["Democracy"],
    screens: [],
    interruptions: { enabled: true, maxLiveTurns: 8, maxLiveSeconds: 180 },
    steps: [
      { id: "s1", type: "say" },
      { id: "s2", type: "say" },
      { id: "s3", type: "say" },
      { id: "s4", type: "check", tapFallback: ["yes", "no"] },
    ],
    safety: { neverSay: [] },
    locales: {
      en: {
        status: "reviewed",
        reviewer: "test",
        title: "Democracy",
        steps: {
          s1: { text: "Democracy means rule by the people." },
          s2: { text: "Lincoln called it government of, by and for the people." },
          s3: { text: "India is a representative democracy." },
          s4: { question: "Did you understand?", accept: ["yes"] },
        },
      },
    },
  });
}

describe("board slides", () => {
  it("lists talk steps with English text, in order", () => {
    expect(talkSteps(talkLesson()).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("repairs the AI's slides: trims, caps points, drops unknown steps, carries the heading over", () => {
    const plan = slidePlanSchema.parse({
      slides: [
        { step: "s1", heading: "  Democracy ", points: ["- demos = people", "kratos = rule", "", "a", "b", "c"] },
        { step: "s2", heading: "", points: ["Abraham Lincoln"] },
        { step: "s9", heading: "Unknown", points: ["x"] },
      ],
    });
    const slides = repairSlides(plan, ["s1", "s2", "s3"]);
    expect(slides.s1).toEqual({ heading: "Democracy", points: ["demos = people", "kratos = rule", "a", "b"] });
    expect(slides.s2).toEqual({ heading: "Democracy", points: ["Abraham Lincoln"] });
    // The AI skipped s3: same topic heading, no points.
    expect(slides.s3).toEqual({ heading: "Democracy", points: [] });
    expect(slides).not.toHaveProperty("s9");
  });

  it("round-trips slides through translation lines, falling back to English for dropped lines", () => {
    const en = { s1: { heading: "Democracy", points: ["rule by the people"] }, s3: { heading: "India", points: ["representative", "elections"] } };
    expect(slideLines(en)).toEqual(["Democracy", "rule by the people", "India", "representative", "elections"]);
    const te = slidesFromLines(en, ["ప్రజాస్వామ్యం", "ప్రజల పాలన", "", "ప్రాతినిధ్య"]);
    expect(te).toEqual({ s1: { heading: "ప్రజాస్వామ్యం", points: ["ప్రజల పాలన"] }, s3: { heading: "India", points: ["ప్రాతినిధ్య", "elections"] } });
  });

  it("shows the slide and picture with the teacher's line, and the lesson stays valid", () => {
    let lesson = setSlides(talkLesson(), "en", { s1: { heading: "Democracy", points: ["rule by the people"] } });
    lesson = setStepImage(lesson, "s1", { src: "/lesson-media/history/athens.jpg", credit: "Wikimedia Commons" });
    expect(validateLesson(lesson).errors).toEqual([]);

    const actions = new LessonRunner(lesson, lesson.locales.en!, getLanguage("en")).start();
    const say = actions.find((a) => a.kind === "say" && a.text.startsWith("Democracy means"));
    expect(say?.kind === "say" && say.events).toEqual([
      {
        type: "board_slide",
        stepId: "s1",
        heading: "Democracy",
        points: ["rule by the people"],
        image: { src: "/lesson-media/history/athens.jpg", credit: "Wikimedia Commons" },
      } satisfies AgentEvent,
    ]);
    // Steps without a slide are plain lines: the board keeps the last slide.
    const s2 = actions.find((a) => a.kind === "say" && a.text.startsWith("Lincoln"));
    expect(s2?.kind === "say" && s2.events).toBeUndefined();
  });

  it("rejects pictures that aren't lesson media, and pictures on non-talk steps", () => {
    const bad = structuredClone(talkLesson()) as unknown as { steps: Array<Record<string, unknown>> };
    bad.steps[0]!.image = { src: "https://example.com/a.jpg" };
    expect(lessonSchema.safeParse(bad).success).toBe(false);
    expect(() => setStepImage(talkLesson(), "s4", { src: "/lesson-media/a.jpg" })).toThrow();
  });

  it("reports a missing picture file", () => {
    const lesson = setStepImage(talkLesson(), "s2", { src: "/lesson-media/history/missing.png" });
    expect(validateLesson(lesson, { mediaExists: () => false }).errors).toContain('steps.s2: picture "/lesson-media/history/missing.png" not found');
  });
});
