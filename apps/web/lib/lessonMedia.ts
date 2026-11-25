import "server-only";
import {
  extensionOf,
  IMAGE_EXTENSIONS,
  isUploadedFileName,
  locateMedia,
  MAX_CLIP_BYTES,
  MAX_POSTER_BYTES,
  uploadedMediaUrl,
  VIDEO_EXTENSIONS,
} from "@ai-tutor/shared";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Admin-uploaded lesson videos and posters, kept in data/lesson-media/<lessonId>/ (persistent,
 * unlike apps/web/public, which the production build bakes in). Served by /api/lesson-media.
 * File names are chosen by the server (clip-01.mp4), never taken from the upload.
 */

const LESSON_ID = /^[a-z0-9-]{1,80}$/;

export function lessonMediaDir(): string {
  if (process.env.LESSON_MEDIA_DIR) return resolve(process.env.LESSON_MEDIA_DIR);
  return resolve(process.cwd(), "../../data/lesson-media");
}

/** Absolute path of an uploaded file, or null if the names aren't safe. */
export function uploadedFilePath(lessonId: string, file: string): string | null {
  if (!LESSON_ID.test(lessonId) || !isUploadedFileName(file)) return null;
  const dir = resolve(/* turbopackIgnore: true */ lessonMediaDir(), lessonId);
  const full = resolve(/* turbopackIgnore: true */ dir, file);
  return full.startsWith(dir) ? full : null;
}

/** True when a lesson's media path points at a file that exists (uploaded or in public/). */
export function mediaExists(src: string): boolean {
  const loc = locateMedia(src);
  if (!loc) return false;
  if (loc.root === "uploads") {
    const p = uploadedFilePath(loc.lessonId, loc.file);
    return !!p && existsSync(/* turbopackIgnore: true */ p);
  }
  return existsSync(/* turbopackIgnore: true */ resolve(process.cwd(), "public", "." + loc.path));
}

export class MediaError extends Error {}

export type MediaKind = "video" | "image";

/** Checks an upload's type and size by extension and magic bytes. Throws MediaError with a plain message. */
export function checkUpload(name: string, data: Uint8Array): { kind: MediaKind; ext: string } {
  const ext = extensionOf(name);
  const isVideo = (VIDEO_EXTENSIONS as readonly string[]).includes(ext);
  const isImage = (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
  if (!isVideo && !isImage) throw new MediaError(`"${name}": only MP4 or WebM videos (and PNG, JPG or WebP posters) can be uploaded.`);
  const limit = isVideo ? MAX_CLIP_BYTES : MAX_POSTER_BYTES;
  if (data.byteLength > limit) {
    throw new MediaError(`"${name}" is ${(data.byteLength / 1048576).toFixed(0)} MB; the limit is ${limit / 1048576} MB. Trim or compress it.`);
  }
  if (data.byteLength < 16) throw new MediaError(`"${name}" is empty.`);
  if (!magicMatches(ext, data)) throw new MediaError(`"${name}" doesn't look like a real .${ext} file.`);
  return { kind: isVideo ? "video" : "image", ext: ext === "jpeg" ? "jpg" : ext };
}

function magicMatches(ext: string, d: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...d.subarray(from, to));
  switch (ext) {
    case "mp4":
      return ascii(4, 8) === "ftyp";
    case "webm":
      return d[0] === 0x1a && d[1] === 0x45 && d[2] === 0xdf && d[3] === 0xa3;
    case "png":
      return d[0] === 0x89 && ascii(1, 4) === "PNG";
    case "jpg":
    case "jpeg":
      return d[0] === 0xff && d[1] === 0xd8;
    case "webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    default:
      return false;
  }
}

/**
 * Saves an upload under a server-chosen name (e.g. "clip-03.mp4") and returns its URL.
 * Written to a temporary file first, so a half-written upload is never served.
 */
export async function saveUpload(lessonId: string, baseName: string, ext: string, data: Uint8Array): Promise<string> {
  const file = `${baseName}.${ext}`;
  const full = uploadedFilePath(lessonId, file);
  if (!full) throw new MediaError("Bad file name.");
  await mkdir(resolve(/* turbopackIgnore: true */ lessonMediaDir(), lessonId), { recursive: true });
  // Replacing a clip with another format: drop the old file so only one version exists.
  for (const other of [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]) {
    const old = uploadedFilePath(lessonId, `${baseName}.${other}`);
    if (old && old !== full) await rm(/* turbopackIgnore: true */ old, { force: true });
  }
  const tmp = `${full}.part`;
  await writeFile(/* turbopackIgnore: true */ tmp, data);
  await rename(/* turbopackIgnore: true */ tmp, full);
  return uploadedMediaUrl(lessonId, file);
}

/** Removes every uploaded file of a lesson (when the lesson is deleted). */
export async function deleteLessonMedia(lessonId: string): Promise<void> {
  if (!LESSON_ID.test(lessonId)) return;
  await rm(/* turbopackIgnore: true */ resolve(lessonMediaDir(), lessonId), { recursive: true, force: true });
}

/** Uploaded file names of a lesson. */
export async function listLessonMedia(lessonId: string): Promise<string[]> {
  if (!LESSON_ID.test(lessonId)) return [];
  try {
    return (await readdir(/* turbopackIgnore: true */ resolve(lessonMediaDir(), lessonId))).filter(isUploadedFileName);
  } catch {
    return [];
  }
}
