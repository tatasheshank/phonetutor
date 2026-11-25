import "server-only";
import { slugify, toParagraphs, type PlannedCourseLesson } from "@ai-tutor/shared";
import { randomBytes } from "node:crypto";
import { saveDraft } from "./lessonDrafts";
import { outlineCourse } from "./courseOutlineAi";
import { generateLesson, generateVideoLesson, type ClipInfo } from "./lessonGenerator";
import type { SourceText } from "./lessonSources";

/**
 * Course splitter jobs. Splitting a long document takes a minute or two (one outline call, then
 * one lesson at a time), so it runs in the background and the admin page polls for progress.
 * Jobs live in memory (one web server): if the server restarts mid-way, lessons already prepared
 * are kept as drafts and the admin can run the rest again.
 */

export interface CourseJobLesson {
  part: number;
  title: string;
  /** Paragraph range of the document this lesson was made from. */
  from: number;
  to: number;
  clips: number;
  status: "waiting" | "preparing" | "done" | "failed";
  lessonId?: string;
  error?: string;
}

export interface CourseJob {
  id: string;
  status: "outlining" | "preparing" | "done" | "failed";
  courseName: string;
  kind: "phone" | "video";
  startedAt: string;
  lessons: CourseJobLesson[];
  /** For video courses: where each clip (by its index in the admin's sorted list) must be uploaded. */
  clipTargets: Array<{ clip: number; lessonId: string; stepId: string }>;
  warnings: string[];
  usage: { promptTokens: number; completionTokens: number };
  error?: string;
}

// On globalThis: in development, route modules can be reloaded separately; jobs must survive that.
const store = globalThis as unknown as { __courseJobs?: Map<string, CourseJob> };
const jobs = (store.__courseJobs ??= new Map<string, CourseJob>());

export function getCourseJob(id: string): CourseJob | undefined {
  return jobs.get(id);
}

export function startCourseJob(source: SourceText, opts: { kind: "phone" | "video"; clips: ClipInfo[]; courseName?: string }): CourseJob {
  // Keep memory bounded: drop finished jobs older than a day.
  for (const [id, j] of jobs) if (Date.parse(j.startedAt) < Date.now() - 86_400_000) jobs.delete(id);

  const job: CourseJob = {
    id: randomBytes(6).toString("hex"),
    status: "outlining",
    courseName: opts.courseName?.trim() || "",
    kind: opts.kind,
    startedAt: new Date().toISOString(),
    lessons: [],
    clipTargets: [],
    warnings: [...source.warnings],
    usage: { promptTokens: 0, completionTokens: 0 },
  };
  jobs.set(job.id, job);
  void run(job, source, opts.clips).catch((err) => {
    console.error("[course] job failed", err);
    job.status = "failed";
    job.error = (err as Error).message || "Preparing the course failed.";
  });
  return job;
}

const addUsage = (job: CourseJob, u: { promptTokens: number; completionTokens: number }) => {
  job.usage.promptTokens += u.promptTokens;
  job.usage.completionTokens += u.completionTokens;
};

async function run(job: CourseJob, source: SourceText, clips: ClipInfo[]) {
  const paragraphs = toParagraphs(source.text);
  if (paragraphs.length < 2) throw new Error("The document is too short to split into lessons. Make a single lesson instead.");

  // 1. Outline: lesson titles, paragraph ranges, clips per lesson.
  const outline = await outlineCourse(paragraphs, clips, job.kind, job.courseName || undefined);
  addUsage(job, outline.usage);
  job.courseName ||= outline.courseTitle;
  job.warnings.push(...outline.warnings);
  job.lessons = outline.lessons.map((l) => ({ part: l.part, title: l.title, from: l.from, to: l.to, clips: l.clips.length, status: "waiting" }));
  job.status = "preparing";
  console.log(`[course] ${job.id} "${job.courseName}": ${outline.lessons.length} lessons from ${paragraphs.length} paragraphs, ${clips.length} clips`);

  // 2. Each lesson from its own part of the document, two at a time (Sarvam rate limits).
  const seriesId = `course-${job.id}`;
  const total = outline.lessons.length;
  const queue = [...outline.lessons];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await prepareOne(job, next, paragraphs, clips, source, seriesId, total);
  };
  await Promise.all([worker(), worker()]);

  job.clipTargets.sort((a, b) => a.clip - b.clip);
  const failed = job.lessons.filter((l) => l.status === "failed").length;
  job.status = failed === total ? "failed" : "done";
  if (failed === total) job.error = "No lesson could be prepared. Please try again.";
  console.log(`[course] ${job.id} finished: ${total - failed}/${total} lessons`);
}

async function prepareOne(
  job: CourseJob,
  plan: PlannedCourseLesson,
  paragraphs: string[],
  clips: ClipInfo[],
  source: SourceText,
  seriesId: string,
  total: number,
) {
  const entry = job.lessons.find((l) => l.part === plan.part)!;
  entry.status = "preparing";
  const excerpt: SourceText = {
    kind: source.kind,
    fileName: `${source.fileName}, part ${plan.part} of ${total}`,
    text: paragraphs.slice(plan.from - 1, plan.to).join("\n\n"),
    warnings: [],
  };
  const title = `${plan.part}. ${plan.title}`;
  try {
    const myClips = plan.clips.map((c) => clips[c]!);
    const result =
      job.kind === "video"
        ? await generateVideoLesson(excerpt, myClips, { title, course: job.courseName })
        : await generateLesson(excerpt, title);
    addUsage(job, result.usage);
    // Every lesson of the course goes under one topic (the course name), in order.
    const lesson = { ...result.lesson, course: slugify(job.courseName) || result.lesson.course, order: plan.part };
    await saveDraft({
      id: lesson.id,
      status: "draft",
      createdAt: new Date().toISOString(),
      createdBy: "admin (course splitter)",
      source: { fileName: excerpt.fileName, kind: source.kind, chars: excerpt.text.length },
      warnings: result.warnings,
      usage: result.usage,
      lesson,
      kind: job.kind,
      series: { id: seriesId, name: job.courseName, part: plan.part, total },
    });
    // Video steps are in clip order: clip plan.clips[i] goes to the i-th video step.
    const videoSteps = lesson.steps.filter((s) => s.type === "video").map((s) => s.id);
    plan.clips.forEach((clip, i) => {
      if (videoSteps[i]) job.clipTargets.push({ clip, lessonId: lesson.id, stepId: videoSteps[i]! });
    });
    entry.status = "done";
    entry.lessonId = lesson.id;
  } catch (err) {
    console.error(`[course] ${job.id} part ${plan.part} failed`, err);
    entry.status = "failed";
    entry.error = (err as Error).message;
    job.warnings.push(`Lesson ${plan.part} ("${plan.title}") couldn't be prepared: ${(err as Error).message}`);
  }
}
