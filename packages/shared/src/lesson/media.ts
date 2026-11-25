/**
 * Lesson media (board videos and posters) comes from two places:
 *  - Uploaded by an admin: stored in data/lesson-media/<lessonId>/<file>, served at /api/lesson-media/<lessonId>/<file>.
 *    data/ is persistent (mounted in production), unlike apps/web/public.
 *  - Placed by hand: apps/web/public/lesson-media/<path>, served at /lesson-media/<path>.
 *
 * Pure path logic only (no file system), so the agent, web app and validator agree on it.
 */

export const UPLOADED_MEDIA_PREFIX = "/api/lesson-media/";
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;

export const VIDEO_EXTENSIONS = ["mp4", "webm"] as const;
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

const LESSON_ID = /^[a-z0-9-]{1,80}$/;
/** Names the server gives uploaded files: clip-01.mp4, clip-01-poster.jpg. Never user-supplied. */
const UPLOADED_FILE = /^[a-z0-9][a-z0-9-]{0,60}\.(mp4|webm|png|jpg|jpeg|webp)$/;

export function isUploadedFileName(name: string): boolean {
  return UPLOADED_FILE.test(name);
}

export function uploadedMediaUrl(lessonId: string, fileName: string): string {
  if (!LESSON_ID.test(lessonId) || !isUploadedFileName(fileName)) throw new Error("bad media name");
  return `${UPLOADED_MEDIA_PREFIX}${lessonId}/${fileName}`;
}

export type MediaLocation = { root: "uploads"; lessonId: string; file: string } | { root: "public"; path: string };

/**
 * Where a lesson's media path lives on disk, or null if it isn't a valid media path.
 * Rejects anything with "..", backslashes or unexpected characters.
 */
export function locateMedia(src: string): MediaLocation | null {
  if (src.includes("..") || src.includes("\\")) return null;
  if (src.startsWith(UPLOADED_MEDIA_PREFIX)) {
    const parts = src.slice(UPLOADED_MEDIA_PREFIX.length).split("/");
    if (parts.length !== 2) return null;
    const [lessonId, file] = parts as [string, string];
    return LESSON_ID.test(lessonId) && isUploadedFileName(file) ? { root: "uploads", lessonId, file } : null;
  }
  if (/^\/lesson-media\/[a-z0-9][a-z0-9._/-]*\.(mp4|webm|png|jpg|jpeg|webp)$/.test(src)) return { root: "public", path: src };
  return null;
}

/** Lowercase extension of a file name, or "" (e.g. "Step 01.MP4" -> "mp4"). */
export function extensionOf(name: string): string {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(name);
  return m ? m[1]!.toLowerCase() : "";
}

/** Sorts clip file names the way people number them: "2 open.mp4" before "10 save.mp4". */
export function byClipName(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

/** Parses a single "bytes=a-b" range. Returns null for no/ignored range, "invalid" for unsatisfiable. */
export function parseRange(header: string | null, size: number): [number, number] | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null; // multi-range or odd forms: send the whole file
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return [start, end];
}

/** A YouTube video id: exactly 11 characters of letters, digits, "-" and "_". */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The video id from a YouTube link the admin pastes: youtube.com/watch?v=, youtu.be/, /shorts/,
 * /embed/, /live/ (also m. and music. hosts, and youtube-nocookie.com), or a bare id. Null otherwise.
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (YOUTUBE_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = m ? m[2]! : null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}
