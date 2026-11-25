import { locateMedia, validateLesson, type LanguageCode, type Lesson, type LocalePack } from "@ai-tutor/shared";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function lessonsDir(): string {
  if (process.env.LESSONS_DIR) return resolve(process.env.LESSONS_DIR);
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../content/lessons");
}

/** Uploaded lesson videos: data/lesson-media/<lessonId>/<file> (the web app serves them). */
export function lessonMediaDir(): string {
  if (process.env.LESSON_MEDIA_DIR) return resolve(process.env.LESSON_MEDIA_DIR);
  return resolve(lessonsDir(), "../../data/lesson-media");
}

/** Lesson media is uploaded (data/lesson-media) or placed by hand in apps/web/public/lesson-media. */
export function mediaExists(src: string): boolean {
  const loc = locateMedia(src);
  if (!loc) return false;
  if (loc.root === "uploads") return existsSync(resolve(lessonMediaDir(), loc.lessonId, loc.file));
  const publicDir = process.env.LESSON_MEDIA_PUBLIC_DIR ?? resolve(lessonsDir(), "../../apps/web/public");
  return existsSync(resolve(publicDir, "." + loc.path));
}

export function isLessonId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
}

export type LoadResult = { ok: true; lesson: Lesson; pack: LocalePack } | { ok: false; error: string };

/**
 * Loads and validates a lesson, and picks the pack for the tutor language.
 * Only reviewed packs play, unless ALLOW_DRAFT_LESSONS=true (for testing before native review).
 */
export async function loadLesson(id: string, lang: LanguageCode, allowDrafts = process.env.ALLOW_DRAFT_LESSONS === "true"): Promise<LoadResult> {
  if (!isLessonId(id)) return { ok: false, error: `bad lesson id "${id}"` };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolve(lessonsDir(), `${id}.json`), "utf8"));
  } catch (err) {
    return { ok: false, error: `cannot read lesson ${id}: ${(err as Error).message}` };
  }

  const result = validateLesson(raw, { mediaExists });
  if (!result.lesson) return { ok: false, error: `lesson ${id} is invalid: ${result.errors.join("; ")}` };

  // Structural errors (bad screens, targets, ids) always block. Missing reviews only block without allowDrafts.
  const blocking = result.errors.filter((e) => !e.startsWith("locales"));
  if (blocking.length) return { ok: false, error: `lesson ${id} is invalid: ${blocking.join("; ")}` };

  const pack = result.lesson.locales[lang];
  if (!pack) return { ok: false, error: `lesson ${id} has no ${lang} text` };
  if (!result.playableLanguages.includes(lang) && !allowDrafts) {
    return { ok: false, error: `lesson ${id} (${lang}) is not reviewed yet; set ALLOW_DRAFT_LESSONS=true to test it` };
  }
  return { ok: true, lesson: result.lesson, pack };
}
