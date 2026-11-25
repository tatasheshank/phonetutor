import "server-only";
import { ALL_LANGUAGE_CODES, markPacksDraft, validateLesson, type Lesson } from "@ai-tutor/shared";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mediaExists } from "./lessonMedia";
import { lessonsDir } from "./lessons";

/**
 * AI-prepared lessons waiting for an admin. Drafts live in data/lesson-drafts/ (never shown to
 * learners). Publishing writes the lesson to content/lessons/, where learners and the tutor find it.
 * TODO(M4): move drafts and published lessons to Postgres with versions.
 */
export interface LessonDraft {
  id: string;
  status: "draft" | "published";
  createdAt: string;
  createdBy: string;
  source: { fileName: string; kind: string; chars: number };
  warnings: string[];
  usage: { promptTokens: number; completionTokens: number };
  lesson: Lesson;
  publishedAt?: string;
  /** "video": a board-video lesson (e.g. computer topics), no phone screens. Older drafts: phone. */
  kind?: "phone" | "video";
  /** Edited after publishing: learners still get the published version until it is published again. */
  pendingChanges?: boolean;
}

const isDraftId = (id: string) => /^[a-z0-9-]{1,80}$/.test(id);

export function draftsDir(): string {
  return resolve(process.cwd(), "../../data/lesson-drafts");
}

export async function saveDraft(draft: LessonDraft): Promise<void> {
  if (!isDraftId(draft.id)) throw new Error("bad draft id");
  await mkdir(draftsDir(), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ resolve(draftsDir(), `${draft.id}.json`), JSON.stringify(draft, null, 2), "utf8");
}

export async function loadDraft(id: string): Promise<LessonDraft | null> {
  if (!isDraftId(id)) return null;
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ resolve(draftsDir(), `${id}.json`), "utf8")) as LessonDraft;
  } catch {
    return null;
  }
}

export async function listDrafts(): Promise<LessonDraft[]> {
  let files: string[] = [];
  try {
    files = (await readdir(/* turbopackIgnore: true */ draftsDir())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const drafts = await Promise.all(files.map((f) => loadDraft(f.replace(/\.json$/, ""))));
  return drafts.filter((d): d is LessonDraft => !!d).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDraft(id: string): Promise<void> {
  if (!isDraftId(id)) return;
  await rm(/* turbopackIgnore: true */ resolve(draftsDir(), `${id}.json`), { force: true });
}

/**
 * Publishes a draft for all learners. Every language pack is marked reviewed by the admin who
 * published it; the AI-prepared Telugu and Hindi still deserve a native speaker's check.
 */
export async function publishDraft(id: string, admin: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const draft = await loadDraft(id);
  if (!draft) return { ok: false, errors: ["Draft not found."] };
  const lesson: Lesson = structuredClone(draft.lesson);
  const now = new Date().toISOString();
  for (const code of ALL_LANGUAGE_CODES) {
    const pack = lesson.locales[code];
    if (pack) Object.assign(pack, { status: "reviewed", reviewer: `${admin} (AI-prepared)`, reviewedAt: now });
  }
  const result = validateLesson(lesson, { mediaExists });
  if (!result.ok) return { ok: false, errors: result.errors };

  await mkdir(lessonsDir(), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ resolve(lessonsDir(), `${lesson.id}.json`), JSON.stringify(lesson, null, 2) + "\n", "utf8");
  await saveDraft({ ...draft, status: "published", publishedAt: now, pendingChanges: false, lesson });
  return { ok: true };
}

/** Removes a published lesson from learners (the draft stays, so it can be republished). */
export async function unpublishLesson(id: string): Promise<void> {
  if (!isDraftId(id)) return;
  await rm(/* turbopackIgnore: true */ resolve(lessonsDir(), `${id}.json`), { force: true });
  const draft = await loadDraft(id);
  if (draft) await saveDraft({ ...draft, status: "draft", publishedAt: undefined });
}

/**
 * Applies an admin edit to a draft. Every language goes back to "draft" (an edit needs review),
 * and a published lesson is flagged so the admin publishes again; learners keep the published
 * version until then.
 */
export async function updateDraft(id: string, edit: (lesson: Lesson) => Lesson): Promise<LessonDraft> {
  const draft = await loadDraft(id);
  if (!draft) throw new Error("Draft not found.");
  const lesson = markPacksDraft(edit(draft.lesson));
  const next: LessonDraft = { ...draft, lesson, pendingChanges: draft.status === "published" ? true : draft.pendingChanges };
  await saveDraft(next);
  return next;
}

/** "Excel basics" → "excel-basics". Topic ids are lesson `course` values (see topics.ts). */
export function topicSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Moves a lesson to another topic. Only the grouping changes (no text), so the language packs keep
 * their review status, and a published copy is updated in place so learners see it at once.
 */
export async function setLessonTopic(id: string, topic: string): Promise<void> {
  const slug = topicSlug(topic);
  if (!slug) throw new Error("Topic is empty.");
  const draft = await loadDraft(id);
  if (!draft) throw new Error("Draft not found.");
  await saveDraft({ ...draft, lesson: { ...draft.lesson, course: slug } });
  const published = resolve(lessonsDir(), `${id}.json`);
  try {
    const lesson = JSON.parse(await readFile(/* turbopackIgnore: true */ published, "utf8")) as Lesson;
    await writeFile(/* turbopackIgnore: true */ published, JSON.stringify({ ...lesson, course: slug }, null, 2) + "\n", "utf8");
  } catch {
    // not published: the draft is enough
  }
}
