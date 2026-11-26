import { z } from "zod";
import { locateMedia, YOUTUBE_ID } from "./media";

const langCode = z.enum(["te", "hi", "en"]);


const showStep = z.object({
  id: z.string(),
  type: z.literal("show"),
  screen: z.string(),
  highlight: z.string().optional(),
});

const practiceStep = z.object({
  id: z.string(),
  type: z.literal("practice"),
  screen: z.string(),
  expect: z.object({ tap: z.string() }),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  onFail: z.enum(["demo", "skip"]).default("demo"),
});

const checkStep = z.object({
  id: z.string(),
  type: z.literal("check"),
  tapFallback: z.array(z.string()).min(2),
});

/** A point or box on the video frame, as fractions (0..1) of its width and height. */
const unit = z.number().min(0).max(1);
export const boardCueSchema = z.object({
  /** Seconds into the video where this segment starts. Cues must be in ascending order. */
  at: z.number().min(0),
  /** Where the teacher points (pulsing circle). */
  point: z.object({ x: unit, y: unit }).optional(),
  /** A box drawn around part of the frame. */
  highlightBox: z.object({ x: unit, y: unit, w: unit, h: unit }).optional(),
  /** Pause the video at the end of this segment while the teacher finishes talking. */
  pause: z.boolean().default(true),
});

const mediaPath = (kind: "video" | "image") =>
  z
    .string()
    .refine(
      (src) => locateMedia(src) !== null && (kind === "video" ? /\.(mp4|webm)$/ : /\.(png|jpg|jpeg|webp)$/).test(src),
      kind === "video"
        ? "src must be an uploaded video (/api/lesson-media/<lesson>/<file>.mp4 or .webm) or /lesson-media/<path>.mp4 or .webm"
        : "poster must be an uploaded image or a /lesson-media/ image (.png, .jpg, .jpeg, .webp)",
    );

/**
 * A picture on the board while the teacher talks: an uploaded image or one in public/lesson-media/,
 * with where it came from (e.g. "Wikimedia Commons, public domain"), shown small under it.
 */
export const slideImageSchema = z.object({
  src: mediaPath("image"),
  credit: z.string().max(200).optional(),
});
export type SlideImage = z.infer<typeof slideImageSchema>;

/** The teacher talks. The board shows this step's slide (key points) and picture, if it has them. */
const sayStep = z.object({
  id: z.string(),
  type: z.literal("say"),
  avatar: z.enum(["neutral", "smile", "listening", "thinking"]).default("neutral"),
  image: slideImageSchema.optional(),
});

/**
 * Where a board video comes from, chosen per step:
 *  - upload: a file the admin uploaded (data/lesson-media, served at /api/lesson-media/...) or placed
 *    by hand in apps/web/public/lesson-media/ (served at /lesson-media/...). See ./media.ts.
 *  - youtube: a YouTube video, by its 11-character id only (never a full URL). Played muted from
 *    youtube-nocookie.com; the teacher narrates.
 */
export const videoSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("upload"), src: mediaPath("video"), poster: mediaPath("image").optional() }),
  z.object({ kind: z.literal("youtube"), videoId: z.string().regex(YOUTUBE_ID, "videoId must be an 11-character YouTube id") }),
]);
export type VideoSource = z.infer<typeof videoSourceSchema>;

/** Classroom board: a short video the teacher plays and points at, narrating cue by cue. */
const videoStep = z.object({
  id: z.string(),
  type: z.literal("video"),
  source: videoSourceSchema,
  /** Admin-facing label, e.g. the clip's file name or the YouTube title. Learners don't see it. */
  label: z.string().max(160).optional(),
  cues: z.array(boardCueSchema).min(1),
});

/**
 * Lessons saved before video sources existed had `src` / `poster` on the step. Read them as uploads,
 * so old files keep working; they are written back in the new shape on the next save.
 */
function upgradeLegacyVideoSteps(input: unknown): unknown {
  if (!input || typeof input !== "object" || !Array.isArray((input as { steps?: unknown }).steps)) return input;
  const lesson = input as { steps: unknown[] };
  const steps = lesson.steps.map((s) => {
    if (!s || typeof s !== "object") return s;
    const step = s as Record<string, unknown>;
    if (step.type !== "video" || step.source !== undefined || typeof step.src !== "string") return s;
    const { src, poster, ...rest } = step;
    return { ...rest, source: { kind: "upload", src, ...(typeof poster === "string" ? { poster } : {}) } };
  });
  return { ...lesson, steps };
}

export const stepSchema = z.discriminatedUnion("type", [sayStep, showStep, practiceStep, checkStep, videoStep]);

const quizItem = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("voice") }),
  z.object({
    id: z.string(),
    kind: z.literal("tap"),
    screen: z.string(),
    expect: z.object({ tap: z.string() }),
  }),
]);

export const MAX_SLIDE_POINTS = 4;
export const slideSchema = z.object({
  heading: z.string().max(80),
  points: z.array(z.string().max(120)).max(MAX_SLIDE_POINTS).default([]),
});
export type Slide = z.infer<typeof slideSchema>;

/** Per-language text and audio for one step. Which fields are required depends on the step type. */
const localeStep = z.object({
  text: z.string().optional(),
  audio: z.string().optional(),
  hints: z.array(z.string()).optional(),
  question: z.string().optional(),
  /** Spoken answers to accept, including code-mixed and English forms. */
  accept: z.array(z.string()).optional(),
  /** Video steps: narration per cue, same order as the step's cues. `text` above is an optional intro. */
  cues: z.array(z.object({ text: z.string(), caption: z.string().optional() })).optional(),
  /** Say steps: key points on the board while the teacher speaks (a heading and up to 4 short points). */
  slide: slideSchema.optional(),
});

const localeQuiz = z.object({
  prompt: z.string(),
  rubric: z.string().optional(),
  correction: z.string(),
});

export const localePackSchema = z.object({
  status: z.enum(["draft", "reviewed"]),
  reviewer: z.string().optional(),
  reviewedAt: z.string().optional(),
  title: z.string(),
  steps: z.record(z.string(), localeStep),
  quiz: z.record(z.string(), localeQuiz).default({}),
  /** Phrases the tutor must never say in this language (in addition to the shared list). */
  neverSay: z.array(z.string()).default([]),
});

const lessonObject = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  course: z.string(),
  /** Position within its course/topic (1, 2, ...), for lessons made together by the course splitter. */
  order: z.number().int().min(1).max(999).optional(),
  mode: z.enum(["scripted", "generated"]),
  objectives: z.array(z.string()).min(1),
  screens: z.array(z.string()),
  interruptions: z.object({
    enabled: z.boolean(),
    maxLiveTurns: z.number().int().min(0).max(30),
    maxLiveSeconds: z.number().int().min(0).max(900),
  }),
  steps: z.array(stepSchema).min(1),
  quiz: z.array(quizItem).default([]),
  knowledge: z.array(z.string()).default([]),
  safety: z.object({
    neverSay: z.array(z.string()).default([]),
    onScamWorry: z.string().optional(),
  }),
  locales: z.partialRecord(langCode, localePackSchema),
});

/** A lesson. Older files with `src` on video steps are upgraded on read (see upgradeLegacyVideoSteps). */
export const lessonSchema = z.preprocess(upgradeLegacyVideoSteps, lessonObject);

export type Lesson = z.infer<typeof lessonObject>;
export type LessonStep = z.infer<typeof stepSchema>;
export type LocalePack = z.infer<typeof localePackSchema>;
export type BoardCue = z.infer<typeof boardCueSchema>;
