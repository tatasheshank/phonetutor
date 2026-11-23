import type { AgentEvent } from "@ai-tutor/shared";
import type { RunnerAction } from "./runner";

/** The bits of a LiveKit SpeechHandle the driver needs (kept structural for tests). */
export interface SpeechLike {
  waitForPlayout(): Promise<void>;
  readonly interrupted: boolean;
}

export interface DriverDeps {
  say: (text: string) => SpeechLike;
  send: (event: AgentEvent) => void;
  shallWeContinue: string;
  /** If the learner interrupts but then says nothing, resume after this long. */
  resumeFallbackMs?: number;
  log?: (msg: string, err?: unknown) => void;
}

/**
 * Plays runner actions in order against the voice session.
 *
 * If the learner interrupts the tutor mid-line (by speaking or the Ask button), the rest of that
 * batch is held. Once the tutor has answered their question and gone quiet, it says
 * "Shall we continue?" and replays the held actions from the interrupted line.
 */
export class LessonDriver {
  private chain: Promise<void> = Promise.resolve();
  private executing = 0;
  private held: RunnerAction[] | null = null;
  private answering = false;
  private fallback: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: DriverDeps) {}

  /** Queue actions to play after anything already playing. New actions replace held ones. */
  run(actions: RunnerAction[]): Promise<void> {
    if (actions.length === 0) return this.chain;
    this.clearHeld();
    this.chain = this.chain.then(() => this.exec(actions)).catch((err) => this.deps.log?.("[lesson] action failed", err));
    return this.chain;
  }

  /** True while lines are held after an interruption. */
  get isHolding(): boolean {
    return this.held !== null;
  }

  /** The learner finished a turn (a question) while lines were held: wait for the answer. */
  onLearnerTurn(): void {
    if (!this.held) return;
    this.answering = true;
    if (this.fallback) clearTimeout(this.fallback);
  }

  /** The tutor went quiet (speaking -> listening). Resume if it just answered a question. */
  onAgentIdle(): void {
    if (this.held && this.answering && this.executing === 0) this.resume();
  }

  dispose(): void {
    if (this.fallback) clearTimeout(this.fallback);
  }

  private resume(): void {
    const held = this.held;
    if (!held) return;
    this.run([{ kind: "say", text: this.deps.shallWeContinue }, ...held]);
  }

  private clearHeld(): void {
    this.held = null;
    this.answering = false;
    if (this.fallback) clearTimeout(this.fallback);
    this.fallback = undefined;
  }

  private async exec(actions: RunnerAction[]): Promise<void> {
    this.executing += 1;
    try {
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i]!;
        if (a.kind === "event") {
          this.deps.send(a.event);
        } else if (a.kind === "pause") {
          await new Promise((r) => setTimeout(r, a.ms));
        } else if (a.kind === "say") {
          for (const e of a.events ?? []) this.deps.send(e);
          const handle = this.deps.say(a.text);
          await handle.waitForPlayout();
          if (handle.interrupted) {
            this.held = actions.slice(i);
            this.answering = false;
            this.fallback = setTimeout(() => {
              if (this.held && !this.answering) this.resume();
            }, this.deps.resumeFallbackMs ?? 12_000);
            return;
          }
        }
        // "wait" and "done" need nothing: the next input arrives as an event or a voice turn.
      }
    } finally {
      this.executing -= 1;
    }
  }
}
