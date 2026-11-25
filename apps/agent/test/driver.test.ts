import type { AgentEvent } from "@ai-tutor/shared";
import { describe, expect, it, vi } from "vitest";
import { LessonDriver } from "../src/lesson/driver";
import type { RunnerAction } from "@ai-tutor/shared";

function setup(interruptOn: string[] = []) {
  const log: string[] = [];
  const driver = new LessonDriver({
    say: (text) => {
      log.push(`say:${text}`);
      const interrupted = interruptOn.includes(text);
      if (interrupted) interruptOn.splice(interruptOn.indexOf(text), 1); // only the first time
      return { waitForPlayout: async () => {}, interrupted };
    },
    send: (e: AgentEvent) => log.push(`event:${e.type}`),
    shallWeContinue: "continue?",
    resumeFallbackMs: 50,
  });
  return { driver, log };
}

const batch: RunnerAction[] = [
  { kind: "say", text: "one" },
  { kind: "event", event: { type: "show_screen", screen: "wa.chats" } },
  { kind: "say", text: "two" },
  { kind: "wait" },
];

describe("LessonDriver", () => {
  it("plays actions in order", async () => {
    const { driver, log } = setup();
    await driver.run(batch);
    expect(log).toEqual(["say:one", "event:show_screen", "say:two"]);
  });

  it("holds the rest after an interruption and resumes after the answer", async () => {
    const { driver, log } = setup(["two"]);
    await driver.run(batch);
    expect(log).toEqual(["say:one", "event:show_screen", "say:two"]);
    expect(driver.isHolding).toBe(true);

    driver.onAgentIdle(); // idle without a question: no resume yet
    expect(driver.isHolding).toBe(true);

    driver.onLearnerTurn(); // learner asked something
    driver.onAgentIdle(); // tutor answered and went quiet
    await vi.waitFor(() => expect(driver.isHolding).toBe(false));
    await driver.run([]);
    expect(log.slice(3)).toEqual(["say:continue?", "say:two"]);
  });

  it("resumes on its own if the learner says nothing after interrupting", async () => {
    const { driver, log } = setup(["one"]);
    await driver.run(batch);
    await vi.waitFor(() => expect(log).toContain("say:continue?"), { timeout: 1000 });
    await driver.run([]);
    expect(log).toEqual(["say:one", "say:continue?", "say:one", "event:show_screen", "say:two"]);
  });

  it("drops held lines when new actions arrive (e.g. the learner tapped)", async () => {
    const { driver, log } = setup(["two"]);
    await driver.run(batch);
    await driver.run([{ kind: "say", text: "well done" }]);
    expect(driver.isHolding).toBe(false);
    driver.onLearnerTurn();
    driver.onAgentIdle();
    await driver.run([]);
    expect(log.at(-1)).toBe("say:well done");
    driver.dispose();
  });

  it("re-sends a board cue with its line when the line is repeated after a question", async () => {
    const { driver, log } = setup(["cue two"]);
    const cue = (index: number) =>
      ({ type: "board_cue", stepId: "v", index, at: index * 3, until: null, pause: true, point: null, highlightBox: null, caption: null }) as const;
    await driver.run([
      { kind: "event", event: { type: "board_video", stepId: "v", source: { kind: "upload", src: "/lesson-media/x.webm" } } },
      { kind: "say", text: "cue one", events: [cue(0)] },
      { kind: "say", text: "cue two", events: [cue(1)] },
      { kind: "event", event: { type: "board_done", stepId: "v" } },
    ]);
    driver.onLearnerTurn();
    driver.onAgentIdle();
    await vi.waitFor(() => expect(driver.isHolding).toBe(false));
    await driver.run([]);
    expect(log).toEqual([
      "event:board_video",
      "event:board_cue",
      "say:cue one",
      "event:board_cue",
      "say:cue two", // interrupted here
      "say:continue?",
      "event:board_cue", // the board jumps back to segment 2
      "say:cue two",
      "event:board_done",
    ]);
  });
});
