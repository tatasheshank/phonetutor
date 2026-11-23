import { z } from "zod";

const langCode = z.enum(["te", "hi", "en"]);

const sayStep = z.object({
  id: z.string(),
  type: z.literal("say"),
  avatar: z.enum(["neutral", "smile", "listening", "thinking"]).default("neutral"),
});

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

/**
 * Classroom board: a short video the teacher plays and points at, narrating cue by cue.
 * Media lives in apps/web/public/lesson-media/ for now (served at /lesson-media/...).
 */
const videoStep = z.object({
  id: z.string(),
  type: z.literal("video"),
  src: z.string().regex(/^\/lesson-media\/[a-z0-9][a-z0-9._/-]*\.(mp4|webm)$/, "src must be /lesson-media/<path>.mp4 or .webm"),
  poster: z
    .string()
    .regex(/^\/lesson-media\/[a-z0-9][a-z0-9._/-]*\.(png|jpg|jpeg|webp)$/)
    .optional(),
  cues: z.array(boardCueSchema).min(1),
});

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

export const lessonSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  course: z.string(),
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

export type Lesson = z.infer<typeof lessonSchema>;
export type LessonStep = z.infer<typeof stepSchema>;
export type LocalePack = z.infer<typeof localePackSchema>;
export type BoardCue = z.infer<typeof boardCueSchema>;
