import type { LanguageConfig } from "../languages";
import type { AgentEvent } from "../protocol";
import { nextScreen } from "../screens/manifest";
import type { Lesson, LocalePack } from "./schema";

/** How long the phone needs to show the teacher's press before the next line. */
const TAP_PAUSE_MS = 900;

/**
 * Scripted lesson player: a small typed state machine (no framework).
 * It never talks to LiveKit itself. Every method returns the actions the agent should
 * perform, in order: speak a line, send a UI event, pause, or wait for the learner.
 *
 * The learner only watches: the teacher operates the phone herself. A "practice" step in a
 * lesson file is played as a demonstration: point at the button, explain, press it, and the
 * phone moves to the next screen. The only thing that waits for the learner is a check question
 * ("Did you understand?"), answered by voice or a Yes/No button.
 */
export type RunnerAction =
  /** `events` are sent right before the line is spoken, including when it's repeated after a question. */
  | { kind: "say"; text: string; events?: AgentEvent[] }
  | { kind: "event"; event: AgentEvent }
  /** Let the phone finish an animation (e.g. the teacher's press) before carrying on. */
  | { kind: "pause"; ms: number }
  | { kind: "wait" }
  | { kind: "done" };

export class LessonRunner {
  private index = -1;
  private finished = false;
  /** Screen and highlight the phone is showing now. */
  private screen: string | null = null;
  private highlight: string | null = null;

  constructor(
    private readonly lesson: Lesson,
    private readonly pack: LocalePack,
    private readonly lang: LanguageConfig,
  ) {}

  get total(): number {
    return this.lesson.steps.length;
  }

  get done(): boolean {
    return this.finished;
  }

  /** The check step waiting for the learner's answer, if any. */
  get currentCheckStepId(): string | null {
    const step = this.lesson.steps[this.index];
    return step?.type === "check" && !this.finished ? step.id : null;
  }

  start(): RunnerAction[] {
    this.index = -1;
    this.finished = false;
    this.screen = null;
    this.highlight = null;
    return [
      { kind: "event", event: { type: "lesson_start", lessonId: this.lesson.id, title: this.pack.title, total: this.total } },
      ...this.advance(),
    ];
  }

  /**
   * An answer to the current check step, by tap (an option key) or voice (a transcript).
   * Returns null when it isn't an answer to a check, so the agent can treat it as a question.
   */
  onCheckAnswer(stepId: string | null, value: string, via: "tap" | "voice"): RunnerAction[] | null {
    const checkId = this.currentCheckStepId;
    if (!checkId || (stepId !== null && stepId !== checkId)) return null;
    const accept = this.pack.steps[checkId]?.accept ?? [];

    let positive: boolean;
    if (via === "tap") {
      positive = normalize(value) !== "no";
    } else {
      if (!matchesAny(value, accept)) return null;
      positive = true;
    }
    return [
      { kind: "event", event: { type: "check_done", stepId: checkId } },
      { kind: "say", text: positive ? this.lang.phrases.wellDone.split(/[!.।]/)[0] + "!" : this.lang.phrases.letMeShow.split(/[,.،]/)[0] + "." },
      ...this.advance(),
    ];
  }

  /** After an interruption while waiting (the check question): ask it again. */
  resume(): RunnerAction[] {
    if (this.finished || !this.lesson.steps[this.index]) return [];
    return [{ kind: "say", text: this.lang.phrases.shallWeContinue }, ...this.playCurrent()];
  }

  /** Grounding for live answers: what the learner is looking at and what this step teaches. */
  contextForLlm(): string {
    const step = this.lesson.steps[this.index];
    const lines = [`The learner is in the lesson "${this.pack.title}". Objectives: ${this.lesson.objectives.join("; ")}.`];
    lines.push("The teacher operates the phone on screen and the learner watches; the learner does not tap anything.");
    if (step) {
      const text = this.pack.steps[step.id];
      lines.push(`Current step (${this.index + 1} of ${this.total}): ${text?.text ?? text?.question ?? ""}`);
      if (step.type === "practice") lines.push(`The teacher is showing how to tap "${step.expect.tap}" on screen "${step.screen}".`);
      if (step.type === "video") {
        const narration = (text?.cues ?? []).map((c) => c.text).join(" ");
        lines.push(`They are watching a short video on the board. The teacher's narration: ${narration}`);
      }
    }
    lines.push("Answer their question briefly, then the lesson will continue.");
    return lines.join("\n");
  }

  // ---- internals ----

  /**
   * Switch the phone to `screen`. If the highlighted button leads there (like the son's chat row
   * leading to the chat), the teacher presses it first, as you would on a real phone.
   */
  private goTo(screen: string): RunnerAction[] {
    const actions: RunnerAction[] = [];
    if (this.screen && this.screen !== screen && this.highlight && nextScreen(this.screen, this.highlight) === screen) {
      actions.push({ kind: "event", event: { type: "tap", target: this.highlight } }, { kind: "pause", ms: TAP_PAUSE_MS });
    }
    actions.push({ kind: "event", event: { type: "show_screen", screen } });
    this.screen = screen;
    this.highlight = null;
    return actions;
  }

  private point(target: string | null): RunnerAction {
    this.highlight = target;
    return { kind: "event", event: { type: "highlight", target } };
  }

  /** Moves to the next step and plays steps until one needs the learner. */
  private advance(): RunnerAction[] {
    const actions: RunnerAction[] = [];
    while (true) {
      this.index += 1;
      if (this.index >= this.lesson.steps.length) {
        this.finished = true;
        actions.push(
          { kind: "event", event: { type: "highlight", target: null } },
          { kind: "event", event: { type: "lesson_done" } },
          { kind: "say", text: this.lang.phrases.lessonComplete },
          { kind: "done" },
        );
        return actions;
      }
      actions.push({ kind: "event", event: { type: "progress", index: this.index, total: this.total } });
      actions.push(...this.playCurrent());
      if (actions.at(-1)?.kind === "wait") return actions;
    }
  }

  /** The actions for the current step, ending in "wait" if the learner must answer. */
  private playCurrent(): RunnerAction[] {
    const step = this.lesson.steps[this.index];
    if (!step) return [];
    const text = this.pack.steps[step.id];
    const say = (line?: string): RunnerAction[] => (line ? [{ kind: "say", text: line }] : []);

    switch (step.type) {
      case "say":
        return say(text?.text);
      case "show":
        return [...this.goTo(step.screen), this.point(step.highlight ?? null), ...say(text?.text)];
      case "practice": {
        // Demonstration: point, explain, then the teacher presses it and the phone moves on.
        const target = step.expect.tap;
        const actions: RunnerAction[] = [
          ...this.goTo(step.screen),
          this.point(target),
          ...say(text?.text),
          { kind: "event", event: { type: "tap", target } },
          { kind: "pause", ms: TAP_PAUSE_MS },
        ];
        this.screen = nextScreen(step.screen, target) ?? step.screen;
        this.highlight = null;
        return actions;
      }
      case "video": {
        const cueTexts = text?.cues ?? [];
        const actions: RunnerAction[] = [
          { kind: "event", event: { type: "board_video", stepId: step.id, src: step.src, ...(step.poster ? { poster: step.poster } : {}) } },
          ...say(text?.text),
        ];
        step.cues.forEach((cue, index) => {
          const event: AgentEvent = {
            type: "board_cue",
            stepId: step.id,
            index,
            at: cue.at,
            until: step.cues[index + 1]?.at ?? null,
            pause: cue.pause,
            point: cue.point ?? null,
            highlightBox: cue.highlightBox ?? null,
            caption: cueTexts[index]?.caption ?? null,
          };
          const narration = cueTexts[index]?.text;
          actions.push(narration ? { kind: "say", text: narration, events: [event] } : { kind: "event", event });
        });
        actions.push({ kind: "event", event: { type: "board_done", stepId: step.id } });
        return actions;
      }
      case "check":
        return [
          { kind: "event", event: { type: "check", stepId: step.id, question: text?.question ?? "", options: step.tapFallback } },
          ...say(text?.question),
          { kind: "wait" },
        ];
    }
  }
}

/** Lowercase, strip punctuation (keeping letters and combining marks of any script), collapse spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if any accepted answer appears as whole words in the transcript. */
export function matchesAny(transcript: string, accept: string[]): boolean {
  const t = ` ${normalize(transcript)} `;
  return accept.some((a) => {
    const n = normalize(a);
    return n.length > 0 && t.includes(` ${n} `);
  });
}
