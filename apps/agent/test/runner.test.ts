import { getLanguage, lessonSchema, type Lesson } from "@ai-tutor/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LessonRunner, matchesAny, normalize, type RunnerAction } from "../src/lesson/runner";

const lesson: Lesson = lessonSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "../../../content/lessons/wa-video-call-01.json"), "utf8")),
);

function runner(code: "te" | "hi" | "en" = "en", l: Lesson = lesson) {
  return new LessonRunner(l, l.locales[code]!, getLanguage(code));
}

const says = (a: RunnerAction[]) => a.filter((x) => x.kind === "say").map((x) => (x as { text: string }).text);
const events = (a: RunnerAction[]) => a.filter((x) => x.kind === "event").map((x) => (x as { event: { type: string } }).event);
const types = (a: RunnerAction[]) => events(a).map((e) => e.type);
/** Readable trace: "screen:<id>", "point:<target>", "tap:<target>", other event types, "say", "pause", "wait", "done". */
const trace = (a: RunnerAction[]) =>
  a.map((x) => {
    if (x.kind !== "event") return x.kind;
    const e = x.event;
    if (e.type === "tap") return `tap:${e.target}`;
    if (e.type === "show_screen") return `screen:${e.screen}`;
    if (e.type === "highlight") return `point:${e.target}`;
    return e.type;
  });

describe("LessonRunner (teacher demonstrates, learner watches)", () => {
  it("demonstrates every step on the phone and stops only at the check question", () => {
    const r = runner();
    const a = r.start();
    expect(trace(a)).toEqual([
      "lesson_start",
      "progress", // s1 say
      "say",
      "progress", // s2 show: chat list, point at the son's row
      "screen:wa.chats",
      "point:row.beta",
      "say",
      "progress", // s3 demo: the row leads to the chat, so the teacher presses it; then the camera
      "tap:row.beta",
      "pause",
      "screen:wa.chat",
      "point:btn.videoCall",
      "say",
      "tap:btn.videoCall",
      "pause",
      "progress", // s4 demo: the camera already led to the call screen; point at and press the red button
      "screen:wa.call",
      "point:btn.endCall",
      "say",
      "tap:btn.endCall",
      "pause",
      "progress", // s5 check: waits for the learner
      "check",
      "say",
      "wait",
    ]);
    const en = lesson.locales.en!.steps;
    expect(says(a)).toEqual([en.s1!.text, en.s2!.text, en.s3!.text, en.s4!.text, en.s5!.question]);
    expect(r.currentCheckStepId).toBe("s5");
    expect(r.total).toBe(5); // steps only; there is no quiz for the learner to tap
  });

  it("never asks the learner to tap anything", () => {
    expect(types(runner().start())).not.toContain("practice");
  });

  it("accepts a spoken answer to the check and finishes", () => {
    const r = runner("te");
    r.start();
    expect(r.onCheckAnswer(null, "వీడియో కాల్ ఎలా చేయాలి?", "voice")).toBeNull(); // a question, not an answer
    const end = r.onCheckAnswer(null, "అవును, అర్థమైంది!", "voice")!;
    expect(types(end)).toEqual(["check_done", "highlight", "lesson_done"]);
    expect(says(end).at(-1)).toBe(getLanguage("te").phrases.lessonComplete);
    expect(end.at(-1)).toEqual({ kind: "done" });
    expect(r.done).toBe(true);
  });

  it("accepts Yes/No buttons", () => {
    const r = runner();
    r.start();
    expect(r.onCheckAnswer("other", "yes", "tap")).toBeNull();
    expect(types(r.onCheckAnswer("s5", "no", "tap")!)).toContain("lesson_done");
  });

  it("asks the check question again after an interruption", () => {
    const r = runner();
    r.start();
    const a = r.resume();
    expect(says(a)[0]).toBe(getLanguage("en").phrases.shallWeContinue);
    expect(types(a)).toEqual(["check"]);
    expect(a.at(-1)).toEqual({ kind: "wait" });
  });

  it("gives the LLM context about the current step", () => {
    const r = runner();
    r.start();
    const ctx = r.contextForLlm();
    expect(ctx).toContain(lesson.locales.en!.title);
    expect(ctx).toContain("learner does not tap");
    expect(ctx).toContain("(5 of 5)");
  });
});

describe("LessonRunner: classroom board video", () => {
  // The sample lesson teaches on the live screen; add a video step to a copy to test the board.
  const withVideo: Lesson = lessonSchema.parse({
    ...JSON.parse(JSON.stringify(lesson)),
    steps: [
      ...lesson.steps.slice(0, 2),
      {
        id: "s2b",
        type: "video",
        src: "/lesson-media/wa-video-call-01/start-call.webm",
        poster: "/lesson-media/wa-video-call-01/start-call.png",
        cues: [
          { at: 0, point: { x: 0.75, y: 0.055 } },
          { at: 3, highlightBox: { x: 0.18, y: 0.17, w: 0.64, h: 0.32 } },
          { at: 6, point: { x: 0.833, y: 0.89 } },
        ],
      },
      ...lesson.steps.slice(2),
    ],
    locales: {
      ...lesson.locales,
      te: {
        ...lesson.locales.te,
        steps: {
          ...lesson.locales.te!.steps,
          s2b: {
            text: "ముందు బోర్డు మీద చూపిస్తాను.",
            cues: [{ text: "ఇక్కడ చూడండి.", caption: "కెమెరా = వీడియో కాల్" }, { text: "ఇప్పుడు కాల్ వెళ్తోంది." }, { text: "ఎర్ర బటన్ నొక్కండి." }],
          },
        },
      },
    },
  });

  it("plays the video, then each cue with its narration, then finishes the board", () => {
    const a = runner("te", withVideo).start();
    const step = withVideo.steps.find((s) => s.type === "video")!;
    if (step.type !== "video") throw new Error("expected a video step");
    const te = withVideo.locales.te!.steps[step.id]!;
    const start = a.findIndex((x) => x.kind === "event" && x.event.type === "board_video");
    const end = a.findIndex((x) => x.kind === "event" && x.event.type === "board_done");
    expect(end).toBeGreaterThan(start);
    const board = a.slice(start + 1, end);
    expect(says(board)).toEqual([te.text, ...te.cues!.map((c) => c.text)]);
    const cues = board.flatMap((x) => (x.kind === "say" ? (x.events ?? []) : []));
    expect(cues.map((c) => (c.type === "board_cue" ? [c.index, c.at, c.until] : null))).toEqual([
      [0, 0, 3],
      [1, 3, 6],
      [2, 6, null],
    ]);
  });
});

describe("answer matching", () => {
  it("normalizes across scripts", () => {
    expect(normalize("  Yes, I DID!! ")).toBe("yes i did");
    expect(normalize("అర్థమైంది!")).toBe("అర్థమైంది");
  });

  it("matches whole words only", () => {
    expect(matchesAny("ok got it", ["ok"])).toBe(true);
    expect(matchesAny("I don't know", ["no"])).toBe(false);
    expect(matchesAny("haan samajh aaya", ["haan"])).toBe(true);
    expect(matchesAny("हाँ समझ आया", ["समझ आया"])).toBe(true);
  });
});
