import { z } from "zod";
import { isScreenId, screenHasTarget } from "../screens/manifest";
import type { Lesson, LessonStep, LocalePack } from "./schema";

/**
 * The lesson plan an AI model proposes from an admin's file (English only).
 * Lenient on purpose: anything doubtful is repaired or dropped by `lessonFromPlan`,
 * so a made-up screen or button can never reach learners.
 */
export const lessonPlanSchema = z.object({
  title: z.string().min(1),
  objectives: z.array(z.string()).default([]),
  steps: z
    .array(
      z.object({
        /** explain: the teacher talks; show: she shows a screen and points; press: she presses a button; check: a yes/no question. */
        kind: z.enum(["explain", "show", "press", "check"]).catch("explain"),
        screen: z.string().nullish(),
        target: z.string().nullish(),
        text: z.string().nullish(),
        question: z.string().nullish(),
        accept: z.array(z.string()).nullish(),
      }),
    )
    .default([]),
});

export type LessonPlan = z.infer<typeof lessonPlanSchema>;

export const MAX_GENERATED_STEPS = 14;

const DEFAULT_CHECK = {
  question: "Did you understand?",
  accept: ["yes", "yes i did", "ok", "okay", "understood", "got it", "haan"],
};

/** "Send a photo on WhatsApp!" -> "send-a-photo-on-whatsapp" */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "lesson"
  );
}

/**
 * Turns an AI lesson plan into a draft lesson with an English pack.
 * Repairs instead of failing: steps on unknown screens or buttons become plain explanations
 * (with a warning for the admin), empty steps are dropped, and a final check question is added if missing.
 */
export function lessonFromPlan(plan: LessonPlan, id: string): { lesson: Lesson; warnings: string[] } {
  const warnings: string[] = [];
  const steps: LessonStep[] = [];
  const texts: LocalePack["steps"] = {};
  const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

  const add = (step: LessonStep, text: LocalePack["steps"][string]) => {
    steps.push(step);
    texts[step.id] = text;
  };
  const nextId = () => `s${steps.length + 1}`;

  for (const [i, p] of plan.steps.entries()) {
    const text = clean(p.text);
    const where = `Step ${i + 1}`;

    if (p.kind === "check") {
      continue; // one check question goes at the end
    }
    if (p.kind === "show" || p.kind === "press") {
      const screen = clean(p.screen);
      const target = clean(p.target);
      if (!isScreenId(screen)) {
        // Models sometimes put a step kind or "none" in "screen": not worth a warning.
        const placeholder = !screen || ["explain", "show", "press", "check", "none", "null"].includes(screen.toLowerCase());
        if (!placeholder) warnings.push(`${where}: needs a phone screen we don't have yet ("${screen}"), so the teacher only explains this step.`);
        if (text) add({ id: nextId(), type: "say", avatar: "neutral" }, { text });
        continue;
      }
      const validTarget = target && screenHasTarget(screen, target) ? target : null;
      if (target && !validTarget) warnings.push(`${where}: screen "${screen}" has no button "${target}".`);
      if (!text) {
        warnings.push(`${where}: had no words for the teacher, so it was skipped.`);
        continue;
      }
      if (p.kind === "press" && validTarget) {
        // "Show X" then "press X" says the same thing twice: keep the show's line, then press.
        const prev = steps.at(-1);
        if (prev?.type === "show" && prev.screen === screen && prev.highlight === validTarget) {
          steps.pop();
          const prevText = texts[prev.id]!;
          delete texts[prev.id];
          add({ id: prev.id, type: "practice", screen, expect: { tap: validTarget }, maxAttempts: 3, onFail: "demo" }, prevText);
          continue;
        }
        add({ id: nextId(), type: "practice", screen, expect: { tap: validTarget }, maxAttempts: 3, onFail: "demo" }, { text });
      } else {
        add({ id: nextId(), type: "show", screen, ...(validTarget ? { highlight: validTarget } : {}) }, { text });
      }
      continue;
    }
    if (text) add({ id: nextId(), type: "say", avatar: i === 0 ? "smile" : "neutral" }, { text });
  }

  if (steps.length > MAX_GENERATED_STEPS - 1) {
    warnings.push(`The plan had ${steps.length} steps; only the first ${MAX_GENERATED_STEPS - 1} were kept. Split long topics into several lessons.`);
    for (const s of steps.splice(MAX_GENERATED_STEPS - 1)) delete texts[s.id];
  }

  // Exactly one check question, at the end.
  const planned = plan.steps.find((p) => p.kind === "check" && clean(p.question));
  const question = clean(planned?.question) || DEFAULT_CHECK.question;
  const accept = [...new Set([...(planned?.accept ?? []).map(clean).filter(Boolean), ...DEFAULT_CHECK.accept])];
  add({ id: nextId(), type: "check", tapFallback: ["yes", "no"] }, { question, accept });

  if (steps.length < 2) warnings.push("The file didn't give enough steps to teach; check the content.");

  const screens = [...new Set(steps.flatMap((s) => (s.type === "show" || s.type === "practice" ? [s.screen] : [])))];
  if (screens.length === 0) warnings.push("No built-in phone screens match this topic, so the teacher explains it in words only.");

  const lesson: Lesson = {
    id,
    version: 1,
    course: "generated",
    mode: "scripted",
    objectives: plan.objectives.map(clean).filter(Boolean).slice(0, 5).concat(plan.objectives.length ? [] : [clean(plan.title)]),
    screens,
    interruptions: { enabled: true, maxLiveTurns: 8, maxLiveSeconds: 180 },
    steps,
    quiz: [],
    knowledge: [],
    safety: { neverSay: ["share your otp", "tell me your pin"] },
    locales: {
      en: { status: "draft", title: clean(plan.title), steps: texts, quiz: {}, neverSay: [] },
    },
  };
  return { lesson, warnings };
}

/**
 * Makes a translated pack safe to use: same step ids as English, every required field present.
 * Missing pieces fall back to English (with a warning), so a lesson never plays an empty line.
 */
export function mergeTranslatedPack(english: LocalePack, translated: unknown, lang: string): { pack: LocalePack; warnings: string[] } {
  const warnings: string[] = [];
  const t = (translated && typeof translated === "object" ? translated : {}) as {
    title?: unknown;
    steps?: Record<string, { text?: unknown; question?: unknown; accept?: unknown; cues?: unknown }>;
  };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const steps: LocalePack["steps"] = {};
  let missing = 0;

  for (const [id, en] of Object.entries(english.steps)) {
    const tr = t.steps?.[id] ?? {};
    const out: LocalePack["steps"][string] = {};
    if (en.text) out.text = str(tr.text) ?? (missing++, en.text);
    if (en.question) out.question = str(tr.question) ?? (missing++, en.question);
    if (en.accept) {
      const acc = Array.isArray(tr.accept) ? tr.accept.map(str).filter((a): a is string => !!a) : [];
      // Keep the English answers too: learners mix languages.
      out.accept = [...new Set([...acc, ...en.accept])];
    }
    if (en.cues) {
      // Board narration, cue by cue (same order and count as English).
      const trCues = Array.isArray(tr.cues) ? (tr.cues as Array<{ text?: unknown } | string>) : [];
      out.cues = en.cues.map((c, i) => {
        const t = trCues[i];
        const text = str(typeof t === "string" ? t : t?.text);
        if (!text && c.text) missing++;
        return { text: text ?? c.text };
      });
    }
    steps[id] = out;
  }
  if (missing) warnings.push(`${lang}: ${missing} line(s) were not translated and use English for now.`);

  return {
    pack: { status: "draft", title: str(t.title) ?? english.title, steps, quiz: {}, neverSay: [] },
    warnings,
  };
}
