import { z } from "zod";
import type { LanguageCode } from "../languages";
import { MAX_SLIDE_POINTS, type Lesson, type Slide, type SlideImage } from "./schema";

/**
 * Board slides for talk steps: while the teacher speaks, the board shows a heading, a few key
 * points and, optionally, a picture. The AI drafts the English slides from the teacher's lines
 * (see slidePlanSchema); they are translated like any other text. Pictures are set by an admin.
 */

/** What the AI returns: one slide per talk step, keyed by step id. Loose on purpose; repaired below. */
export const slidePlanSchema = z.object({
  slides: z
    .array(
      z.object({
        step: z.string(),
        heading: z.string().nullish(),
        points: z.array(z.string().nullish()).nullish().catch(null),
      }),
    )
    .default([]),
});
export type SlidePlan = z.infer<typeof slidePlanSchema>;

const HEADING_MAX = 60;
const POINT_MAX = 90;
const clean = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim().replace(/^[-•*\d.)\s]+/, "");
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
};

/** Talk steps with English text: what slides are made for, in lesson order. */
export function talkSteps(lesson: Lesson): Array<{ id: string; text: string }> {
  const en = lesson.locales.en;
  return lesson.steps.flatMap((s) => {
    const text = s.type === "say" ? en?.steps[s.id]?.text?.trim() : "";
    return s.type === "say" && text ? [{ id: s.id, text }] : [];
  });
}

/**
 * Turns the AI's answer into clean slides for the given talk steps: unknown steps are dropped,
 * points trimmed and capped, and a step the AI skipped repeats the previous slide's heading
 * (same topic), so the board never goes blank in the middle of a topic.
 */
export function repairSlides(plan: SlidePlan, stepIds: string[]): Record<string, Slide> {
  const byStep = new Map(plan.slides.map((s) => [s.step, s]));
  const out: Record<string, Slide> = {};
  let lastHeading = "";
  for (const id of stepIds) {
    const s = byStep.get(id);
    const heading = clean(s?.heading, HEADING_MAX) || lastHeading;
    const points = (s?.points ?? [])
      .map((p) => clean(p, POINT_MAX))
      .filter(Boolean)
      .slice(0, MAX_SLIDE_POINTS);
    if (!heading && points.length === 0) continue;
    out[id] = { heading, points };
    lastHeading = heading;
  }
  return out;
}

/** Flattens slides into lines for translation, and back. Order: heading, then points, per step. */
export function slideLines(slides: Record<string, Slide>): string[] {
  return Object.values(slides).flatMap((s) => [s.heading, ...s.points]);
}

export function slidesFromLines(slides: Record<string, Slide>, lines: string[]): Record<string, Slide> {
  const out: Record<string, Slide> = {};
  let i = 0;
  for (const [id, s] of Object.entries(slides)) {
    // A line the translation dropped falls back to English, so the slide keeps its shape.
    const pick = (en: string) => {
      const t = (lines[i++] ?? "").trim();
      return t || en;
    };
    const heading = pick(s.heading);
    out[id] = { heading, points: s.points.map(pick) };
  }
  return out;
}

/** Puts slides into one language of a lesson (a copy). Steps not in `slides` lose their slide. */
export function setSlides(lesson: Lesson, lang: LanguageCode, slides: Record<string, Slide>): Lesson {
  const out = structuredClone(lesson);
  const pack = out.locales[lang];
  if (!pack) return out;
  for (const step of out.steps) {
    if (step.type !== "say") continue;
    const current = pack.steps[step.id] ?? {};
    const rest = { ...current };
    delete rest.slide;
    pack.steps[step.id] = slides[step.id] ? { ...rest, slide: slides[step.id] } : rest;
  }
  return out;
}

/** Sets or removes (image = null) the board picture of a talk step (a copy). */
export function setStepImage(lesson: Lesson, stepId: string, image: SlideImage | null): Lesson {
  const out = structuredClone(lesson);
  const step = out.steps.find((s) => s.id === stepId);
  if (!step || step.type !== "say") throw new Error(`Step ${stepId} is not a talk step.`);
  if (image) step.image = image;
  else delete step.image;
  return out;
}
