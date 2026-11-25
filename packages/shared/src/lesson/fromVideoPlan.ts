import { z } from "zod";
import { slugify } from "./fromPlan";
import type { BoardCue, Lesson, LessonStep, LocalePack } from "./schema";

/**
 * Video lessons (computer topics such as Excel): the teacher plays the admin's screen recordings
 * on the board and narrates them cue by cue. No phone practice screens are ever used.
 *
 * The AI plans which clip goes where and drafts narration with rough timings; the admin then sets
 * exact times and where to point in the cue editor.
 */
export const videoPlanSchema = z.object({
  title: z.string().min(1),
  objectives: z.array(z.string()).default([]),
  steps: z
    .array(
      z.object({
        /** explain: the teacher talks; clip: she plays a clip and narrates it; check: one yes/no question at the end. */
        kind: z.enum(["explain", "clip", "check"]).catch("explain"),
        text: z.string().nullish(),
        /** 1-based clip number. */
        clip: z.coerce.number().int().nullish().catch(null),
        intro: z.string().nullish(),
        cues: z
          .array(z.object({ at: z.coerce.number().nullish().catch(null), text: z.string().nullish() }))
          .nullish()
          .catch(null),
        question: z.string().nullish(),
        accept: z.array(z.string()).nullish(),
      }),
    )
    .default([]),
});
export type VideoPlan = z.infer<typeof videoPlanSchema>;

export interface PlannedClip {
  /** Where the clip will be served, e.g. /api/lesson-media/<id>/clip-s2.mp4 (set per step by the caller). */
  src: (stepId: string) => string;
  /** Original file name, shown to admins. */
  label: string;
  /** Seconds, if the browser could read it. */
  duration: number | null;
}

export const MAX_VIDEO_LESSON_STEPS = 30;
const MAX_CUES_PER_CLIP = 8;

const DEFAULT_CHECK = {
  question: "Did you understand?",
  accept: ["yes", "yes i did", "ok", "okay", "understood", "got it", "haan"],
};

const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Builds a draft video lesson (English pack) from the AI plan and the uploaded clips, in clip order.
 * Repairs instead of failing: every clip is used exactly once and in order (missing clips are added
 * with a placeholder line and a warning), cue times are sorted and kept inside the clip, and exactly
 * one check question ends the lesson.
 */
export function videoLessonFromPlan(
  plan: VideoPlan,
  id: string,
  clips: PlannedClip[],
  course = "computer-basics",
): { lesson: Lesson; warnings: string[] } {
  const warnings: string[] = [];
  const steps: LessonStep[] = [];
  const texts: LocalePack["steps"] = {};
  const used = new Set<number>();
  const nextId = () => `s${steps.length + 1}`;

  const addClip = (index: number, intro: string, planned: Array<{ at: number | null; text: string }>) => {
    const clip = clips[index]!;
    used.add(index);
    const sid = nextId();
    const max = clip.duration && clip.duration > 0.5 ? clip.duration - 0.2 : Number.POSITIVE_INFINITY;
    let cues = planned.filter((c) => c.text).slice(0, MAX_CUES_PER_CLIP);
    if (cues.length === 0) {
      cues = [{ at: 0, text: `Watch this: ${clip.label.replace(/\.[a-z0-9]+$/i, "")}.` }];
      warnings.push(`Clip ${index + 1} ("${clip.label}") had no narration; a placeholder line was added. Write it in the cue editor.`);
    }
    // Times: given ones clamped into the clip; missing ones spread evenly over the clip.
    const span = Number.isFinite(max) ? max : cues.length * 5;
    const timed = cues.map((c, i) => ({
      text: c.text,
      at: c.at !== null && Number.isFinite(c.at) ? Math.min(Math.max(0, c.at), span) : (span * i) / cues.length,
    }));
    timed.sort((a, b) => a.at - b.at);
    timed[0]!.at = 0; // the first cue starts the clip
    const boardCues: BoardCue[] = [];
    let prev = -1;
    for (const c of timed) {
      const at = Math.round(Math.max(c.at, prev + 0.5) * 10) / 10;
      prev = at;
      boardCues.push({ at, pause: true });
    }
    steps.push({ id: sid, type: "video", src: clip.src(sid), label: clip.label, cues: boardCues });
    texts[sid] = { ...(intro ? { text: intro } : {}), cues: timed.map((c) => ({ text: c.text })) };
  };

  for (const p of plan.steps) {
    if (p.kind === "check") continue; // one check goes at the end
    if (p.kind === "clip") {
      const index = (p.clip ?? 0) - 1;
      if (index < 0 || index >= clips.length) {
        warnings.push(`The plan referred to clip ${p.clip ?? "?"}, which doesn't exist; its words became a spoken step.`);
        const words = [clean(p.intro), ...(p.cues ?? []).map((c) => clean(c.text))].filter(Boolean).join(" ");
        if (words) {
          const sid = nextId();
          steps.push({ id: sid, type: "say", avatar: "neutral" });
          texts[sid] = { text: words };
        }
        continue;
      }
      if (used.has(index)) {
        warnings.push(`Clip ${index + 1} was planned twice; it is shown once.`);
        continue;
      }
      // Clips the plan skipped before this one still play, in order.
      for (let k = 0; k < index; k++) if (!used.has(k)) addClip(k, "", []);
      addClip(
        index,
        clean(p.intro),
        (p.cues ?? []).map((c) => ({ at: c.at ?? null, text: clean(c.text) })),
      );
      continue;
    }
    const text = clean(p.text);
    if (text) {
      const sid = nextId();
      steps.push({ id: sid, type: "say", avatar: steps.length === 0 ? "smile" : "neutral" });
      texts[sid] = { text };
    }
  }
  for (let k = 0; k < clips.length; k++) if (!used.has(k)) addClip(k, "", []);

  if (steps.length > MAX_VIDEO_LESSON_STEPS - 1) {
    warnings.push(`The plan had ${steps.length} steps; only the first ${MAX_VIDEO_LESSON_STEPS - 1} were kept. Split it into several lessons.`);
    for (const s of steps.splice(MAX_VIDEO_LESSON_STEPS - 1)) delete texts[s.id];
  }

  const planned = plan.steps.find((p) => p.kind === "check" && clean(p.question));
  const question = clean(planned?.question) || DEFAULT_CHECK.question;
  const accept = [...new Set([...(planned?.accept ?? []).map(clean).filter(Boolean), ...DEFAULT_CHECK.accept])];
  const checkId = nextId();
  steps.push({ id: checkId, type: "check", tapFallback: ["yes", "no"] });
  texts[checkId] = { question, accept };

  if (clips.length === 0) warnings.push("No video clips were added: the teacher only talks. Upload clips on the lesson page.");

  const objectives = plan.objectives.map(clean).filter(Boolean).slice(0, 5);
  const lesson: Lesson = {
    id,
    version: 1,
    course: slugify(course) || "computer-basics",
    mode: "scripted",
    objectives: objectives.length ? objectives : [clean(plan.title)],
    screens: [],
    interruptions: { enabled: true, maxLiveTurns: 8, maxLiveSeconds: 180 },
    steps,
    quiz: [],
    knowledge: [],
    safety: { neverSay: ["share your otp", "tell me your pin", "tell me your password"] },
    locales: { en: { status: "draft", title: clean(plan.title), steps: texts, quiz: {}, neverSay: [] } },
  };
  return { lesson, warnings };
}
