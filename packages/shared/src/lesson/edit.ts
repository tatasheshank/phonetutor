import { ALL_LANGUAGE_CODES, type LanguageCode } from "../languages";
import type { BoardCue, Lesson, LessonStep } from "./schema";

/**
 * Admin edits to a lesson draft: board video steps and their cues. Pure functions on a copy, so
 * the web app's API routes stay thin and the rules are unit-tested here.
 */

type VideoStep = Extract<LessonStep, { type: "video" }>;

/** The next unused step id: s1, s2, ... */
export function nextStepId(lesson: Lesson): string {
  const used = new Set(lesson.steps.map((s) => s.id));
  for (let i = lesson.steps.length + 1; ; i++) if (!used.has(`s${i}`)) return `s${i}`;
}

/**
 * Adds a board video step. It goes before the lesson's final check question (if any), with one cue
 * at 0 s and empty narration in every language, for the admin to fill in the cue editor.
 */
export function appendVideoStep(lesson: Lesson, video: { src: string; label?: string; poster?: string }): { lesson: Lesson; stepId: string } {
  const out = structuredClone(lesson);
  const id = nextStepId(out);
  const step: VideoStep = {
    id,
    type: "video",
    src: video.src,
    ...(video.poster ? { poster: video.poster } : {}),
    ...(video.label ? { label: video.label.slice(0, 160) } : {}),
    cues: [{ at: 0, pause: true }],
  };
  const last = out.steps.at(-1);
  if (last?.type === "check") out.steps.splice(out.steps.length - 1, 0, step);
  else out.steps.push(step);
  for (const code of ALL_LANGUAGE_CODES) {
    const pack = out.locales[code];
    if (pack) pack.steps[id] = { cues: [{ text: "" }] };
  }
  return { lesson: out, stepId: id };
}

export interface CueEdit {
  at: number;
  point?: { x: number; y: number };
  highlightBox?: { x: number; y: number; w: number; h: number };
  pause?: boolean;
  /** Narration per language for this cue. Missing languages keep an empty line (to fill later). */
  text: Partial<Record<LanguageCode, string>>;
  caption?: Partial<Record<LanguageCode, string>>;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Replaces a video step's cues and narration. Cues are sorted by time, times made strictly
 * increasing, and points/boxes clamped to the frame, so the result always validates.
 * `intro` is the optional line the teacher says before the video starts, per language.
 */
export function setVideoCues(
  lesson: Lesson,
  stepId: string,
  edits: CueEdit[],
  intro: Partial<Record<LanguageCode, string>> = {},
): Lesson {
  const out = structuredClone(lesson);
  const step = out.steps.find((s): s is VideoStep => s.id === stepId && s.type === "video");
  if (!step) throw new Error(`no video step "${stepId}"`);
  if (edits.length === 0) throw new Error("a video needs at least one cue");
  if (edits.length > 40) throw new Error("at most 40 cues per video");

  const sorted = [...edits].sort((a, b) => a.at - b.at);
  let prev = -1;
  const cues: BoardCue[] = sorted.map((e) => {
    // Strictly increasing, 0.1 s apart at least.
    const at = round(Math.max(Math.max(0, e.at), prev + 0.1), 2);
    prev = at;
    const cue: BoardCue = { at, pause: e.pause ?? true };
    if (e.point) cue.point = { x: round(clamp01(e.point.x)), y: round(clamp01(e.point.y)) };
    if (e.highlightBox) {
      const x = clamp01(e.highlightBox.x);
      const y = clamp01(e.highlightBox.y);
      const w = clamp01(Math.min(e.highlightBox.w, 1 - x));
      const h = clamp01(Math.min(e.highlightBox.h, 1 - y));
      if (w > 0.005 && h > 0.005) cue.highlightBox = { x: round(x), y: round(y), w: round(w), h: round(h) };
    }
    return cue;
  });
  step.cues = cues;

  for (const code of ALL_LANGUAGE_CODES) {
    const pack = out.locales[code];
    if (!pack) continue;
    const clean = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim();
    const introText = clean(intro[code]);
    pack.steps[stepId] = {
      ...(introText ? { text: introText } : {}),
      cues: sorted.map((e) => {
        const caption = clean(e.caption?.[code]);
        return { text: clean(e.text[code]), ...(caption ? { caption } : {}) };
      }),
    };
  }
  return out;
}

/** Removes a step (and its text in every language). The last check question can't be removed. */
export function removeStep(lesson: Lesson, stepId: string): Lesson {
  const out = structuredClone(lesson);
  const i = out.steps.findIndex((s) => s.id === stepId);
  if (i < 0) throw new Error(`no step "${stepId}"`);
  if (out.steps.length === 1) throw new Error("a lesson needs at least one step");
  out.steps.splice(i, 1);
  for (const code of ALL_LANGUAGE_CODES) delete out.locales[code]?.steps[stepId];
  return out;
}

/** Moves a step up (-1) or down (+1). */
export function moveStep(lesson: Lesson, stepId: string, by: -1 | 1): Lesson {
  const out = structuredClone(lesson);
  const i = out.steps.findIndex((s) => s.id === stepId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= out.steps.length) return out;
  [out.steps[i], out.steps[j]] = [out.steps[j]!, out.steps[i]!];
  return out;
}

/** Marks every language as draft (after an edit, until an admin reviews and publishes again). */
export function markPacksDraft(lesson: Lesson): Lesson {
  const out = structuredClone(lesson);
  for (const code of ALL_LANGUAGE_CODES) {
    const pack = out.locales[code];
    if (pack) {
      pack.status = "draft";
      delete pack.reviewer;
      delete pack.reviewedAt;
    }
  }
  return out;
}

/** Empty narration lines per language, so the admin page can say what still needs words. */
export function missingNarration(lesson: Lesson): Array<{ stepId: string; lang: LanguageCode; cue: number }> {
  const missing: Array<{ stepId: string; lang: LanguageCode; cue: number }> = [];
  for (const step of lesson.steps) {
    if (step.type !== "video") continue;
    for (const code of ALL_LANGUAGE_CODES) {
      const pack = lesson.locales[code];
      if (!pack) continue;
      step.cues.forEach((_, i) => {
        if (!pack.steps[step.id]?.cues?.[i]?.text?.trim()) missing.push({ stepId: step.id, lang: code, cue: i });
      });
    }
  }
  return missing;
}
