import "server-only";
import { ALL_LANGUAGE_CODES, validateLesson, type LanguageCode } from "@ai-tutor/shared";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface LessonSummary {
  id: string;
  course: string;
  steps: number;
  /** Title per language that has text. */
  title: Partial<Record<LanguageCode, string>>;
  /** Languages with a reviewed pack. */
  reviewed: LanguageCode[];
}

export function lessonsDir(): string {
  if (process.env.LESSONS_DIR) return resolve(process.env.LESSONS_DIR);
  return resolve(process.cwd(), "../../content/lessons");
}

/** Lesson media is served from apps/web/public (e.g. /lesson-media/...). */
function mediaExists(src: string): boolean {
  return !src.includes("..") && existsSync(/* turbopackIgnore: true */ resolve(process.cwd(), "public", "." + src));
}

export function allowDraftLessons(): boolean {
  return process.env.ALLOW_DRAFT_LESSONS === "true";
}

/** All structurally valid lessons. Draft-only languages are included; callers filter by language. */
export async function listLessons(): Promise<LessonSummary[]> {
  const dir = lessonsDir();
  let files: string[] = [];
  try {
    files = (await readdir(/* turbopackIgnore: true */ dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out: LessonSummary[] = [];
  for (const f of files.sort()) {
    try {
      const result = validateLesson(JSON.parse(await readFile(/* turbopackIgnore: true */ resolve(dir, f), "utf8")), { mediaExists });
      const lesson = result.lesson;
      if (!lesson || result.errors.some((e) => !e.startsWith("locales"))) continue;
      const title: LessonSummary["title"] = {};
      for (const code of ALL_LANGUAGE_CODES) {
        const pack = lesson.locales[code];
        if (pack) title[code] = pack.title;
      }
      out.push({ id: lesson.id, course: lesson.course, steps: lesson.steps.length + lesson.quiz.length, title, reviewed: result.playableLanguages });
    } catch {
      // skip unreadable lesson files
    }
  }
  return out;
}
