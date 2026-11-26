import "server-only";
import { PRICES } from "@ai-tutor/shared";
import { randomBytes } from "node:crypto";
import { getCourseJob, startCourseJob } from "../courseJobs";
import { normalizeText, type SourceText } from "../lessonSources";
import { understandRequest, writeChapter, type LessonRequest, type Usage } from "./ai";
import { addPictures } from "./pictures";
import { addVideos, YouTubeKeyMissing } from "./videos";

/**
 * Lesson Assistant jobs: the admin asks in plain words ("Add AP Class 10 Biology, Life Processes,
 * with videos and pictures"), optionally with a document, and the assistant does the rest:
 *   1. understands the request (Sarvam),
 *   2. uses the document, or writes chapter notes from the syllabus (Sarvam; the admin must check them),
 *   3. splits it into a course of lessons with board slides, in Telugu, Hindi and English (course splitter),
 *   4. adds YouTube videos with narration (YouTube Data API, free key) and free pictures (Wikimedia Commons),
 *   5. leaves everything as DRAFTS: the admin previews and publishes.
 * Jobs live in memory, like course jobs; lessons already made stay as drafts if the server restarts.
 */

export interface AssistantMessage {
  from: "admin" | "assistant";
  text: string;
  at: string;
  tone?: "info" | "warn" | "done" | "error" | "question";
}

export interface AssistantJob {
  id: string;
  status: "working" | "done" | "failed" | "question";
  startedAt: string;
  messages: AssistantMessage[];
  request?: LessonRequest;
  /** The chapter notes the course was made from, when the assistant wrote them. */
  chapter?: string;
  courseJobId?: string;
  seriesId?: string;
  lessons: Array<{ id: string; title: string; videos: number; pictures: number }>;
  usage: Usage;
  costInr: number;
}

const store = globalThis as unknown as { __assistantJobs?: Map<string, AssistantJob> };
const jobs = (store.__assistantJobs ??= new Map<string, AssistantJob>());

export function getAssistantJob(id: string): AssistantJob | undefined {
  return jobs.get(id);
}

export function listAssistantJobs(): AssistantJob[] {
  return [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export interface AssistantInput {
  message: string;
  /** Text of an attached document (already read), if any. */
  document?: SourceText | null;
  videos?: boolean;
  pictures?: boolean;
}

export function startAssistantJob(input: AssistantInput): AssistantJob {
  for (const [id, j] of jobs) if (Date.parse(j.startedAt) < Date.now() - 3 * 86_400_000) jobs.delete(id);
  const job: AssistantJob = {
    id: randomBytes(6).toString("hex"),
    status: "working",
    startedAt: new Date().toISOString(),
    messages: [{ from: "admin", text: input.message + (input.document ? `\n📎 ${input.document.fileName}` : ""), at: new Date().toISOString() }],
    lessons: [],
    usage: { promptTokens: 0, completionTokens: 0 },
    costInr: 0,
  };
  jobs.set(job.id, job);
  void run(job, input).catch((err) => {
    console.error("[assistant] job failed", err);
    job.status = "failed";
    say(job, `Sorry, something went wrong: ${(err as Error).message}`, "error");
  });
  return job;
}

function say(job: AssistantJob, text: string, tone: AssistantMessage["tone"] = "info") {
  job.messages.push({ from: "assistant", text, at: new Date().toISOString(), tone });
  console.log(`[assistant] ${job.id}: ${text.split("\n")[0]}`);
}

function track(job: AssistantJob) {
  const price = PRICES.llmPerToken["sarvam-105b-conversations"]!;
  return (u: Usage) => {
    job.usage.promptTokens += u.promptTokens;
    job.usage.completionTokens += u.completionTokens;
    job.costInr = job.usage.promptTokens * price.input + job.usage.completionTokens * price.output;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(job: AssistantJob, input: AssistantInput) {
  const t = track(job);
  say(job, "Reading your request…");
  const req = await understandRequest(input.message, input.document?.text ?? null, t);
  if (req.question?.trim() && !input.document) {
    job.status = "question";
    say(job, req.question.trim(), "question");
    return;
  }
  job.request = req;
  const wantVideos = input.videos !== false && req.videos !== false;
  const wantPictures = input.pictures !== false && req.pictures !== false;
  const courseName = (req.course ?? req.chapter ?? "New course").slice(0, 80);
  say(
    job,
    `Making the course "${courseName}"${[req.level, req.subject, req.board].filter(Boolean).length ? ` (${[req.level, req.subject, req.board].filter(Boolean).join(", ")})` : ""}` +
      `${wantVideos || wantPictures ? `, with ${[wantVideos && "videos", wantPictures && "pictures"].filter(Boolean).join(" and ")}` : ""}.`,
  );

  // 1. The chapter text.
  let source: SourceText;
  if (input.document) {
    source = input.document;
    say(job, `Using your document "${source.fileName}" (${source.text.length.toLocaleString("en-IN")} characters).`);
  } else {
    say(job, "No document attached, so I'm writing the chapter notes from the syllabus…");
    const chapter = await writeChapter(req, t);
    job.chapter = chapter;
    source = { kind: "text", fileName: `${courseName} (written by the assistant)`, text: normalizeText(chapter), warnings: [] };
    const words = chapter.split(/\s+/).length;
    say(
      job,
      `Wrote the chapter notes (${words} words, ${(chapter.match(/^## /gm) ?? []).length} sections). They are AI-written from general syllabus knowledge: please check the facts against your textbook.`,
      "warn",
    );
  }

  // 2. Split into lessons (slides and translations included).
  say(job, "Splitting it into lessons and translating into Telugu and Hindi… this takes a few minutes.");
  const course = startCourseJob(source, { kind: "video", clips: [], courseName });
  job.courseJobId = course.id;
  job.seriesId = `course-${course.id}`;
  let reported = 0;
  for (;;) {
    await sleep(2500);
    const c = getCourseJob(course.id);
    if (!c) throw new Error("The course job was lost (the server restarted). Please ask again.");
    const done = c.lessons.filter((l) => l.status === "done" || l.status === "failed").length;
    if (c.lessons.length && done > reported) {
      reported = done;
      say(job, `Lessons ready: ${done} of ${c.lessons.length}.`);
    }
    if (c.status === "done" || c.status === "failed") {
      t(c.usage);
      if (c.status === "failed") throw new Error(c.error ?? "The course couldn't be made.");
      for (const w of c.warnings.slice(0, 5)) say(job, w, "warn");
      job.lessons = c.lessons.filter((l) => l.lessonId).map((l) => ({ id: l.lessonId!, title: `${l.part}. ${l.title}`, videos: 0, pictures: 0 }));
      break;
    }
  }

  // 3. Videos and pictures, one lesson at a time (Sarvam, YouTube and Wikimedia rate limits).
  let youtubeOff = !wantVideos;
  if (wantVideos && !process.env.YOUTUBE_API_KEY) {
    youtubeOff = true;
    say(job, "Videos skipped: YOUTUBE_API_KEY isn't set. It's a free Google key; see the note on this page.", "warn");
  }
  for (const lesson of job.lessons) {
    const log = (text: string) => say(job, `${lesson.title}: ${text}`, "warn");
    if (!youtubeOff) {
      try {
        const videos = await addVideos(lesson.id, req, t, log);
        lesson.videos = videos.length;
        if (videos.length) say(job, `${lesson.title}: added ${videos.map((v) => `"${v.title}"`).join(" and ")}.`);
      } catch (err) {
        if (err instanceof YouTubeKeyMissing) youtubeOff = true;
        else if (/quota/i.test((err as Error).message)) {
          youtubeOff = true;
          say(job, "YouTube's free daily search limit is used up; the rest of the lessons have no videos. Try again tomorrow.", "warn");
        } else log(`videos failed: ${(err as Error).message}`);
      }
    }
    if (wantPictures) {
      try {
        const pics = await addPictures(lesson.id, req, t, log);
        lesson.pictures = pics.length;
        if (pics.length) say(job, `${lesson.title}: added ${pics.length} picture${pics.length === 1 ? "" : "s"} (${pics.map((p) => p.title.replace(/\.[a-z]+$/i, "")).join("; ")}).`);
      } catch (err) {
        log(`pictures failed: ${(err as Error).message}`);
      }
    }
  }

  // 4. Hand over for review.
  const v = job.lessons.reduce((n, l) => n + l.videos, 0);
  const p = job.lessons.reduce((n, l) => n + l.pictures, 0);
  job.status = "done";
  say(
    job,
    `Done: ${job.lessons.length} lessons, ${v} videos, ${p} pictures, all as drafts. Cost about ₹${job.costInr.toFixed(2)} of Sarvam credit.\n` +
      `Please preview each lesson${v ? " (and watch each video once)" : ""}, then press “Publish all lessons”.`,
    "done",
  );
}
