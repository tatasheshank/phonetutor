import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { parseRange } from "@ai-tutor/shared";
import { uploadedFilePath } from "../../../../../lib/lessonMedia";

/**
 * Serves admin-uploaded lesson videos and posters from data/lesson-media.
 * Supports HTTP Range requests: phones (iOS Safari in particular) need them to play and seek video.
 * Public on purpose: learners' players load these URLs. Names are validated; no other files are reachable.
 */

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(req: Request, { params }: { params: Promise<{ lessonId: string; file: string }> }) {
  const { lessonId, file } = await params;
  const path = uploadedFilePath(lessonId, file);
  if (!path) return new Response("Not found", { status: 404 });

  let size: number;
  let mtime: Date;
  try {
    const st = await stat(/* turbopackIgnore: true */ path);
    if (!st.isFile()) return new Response("Not found", { status: 404 });
    size = st.size;
    mtime = st.mtime;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = file.slice(file.lastIndexOf(".") + 1);
  const etag = `"${size.toString(16)}-${mtime.getTime().toString(16)}"`;
  const headers: Record<string, string> = {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "accept-ranges": "bytes",
    etag,
    "last-modified": mtime.toUTCString(),
    // Re-uploading a clip changes its ETag; a short max-age keeps edits visible quickly.
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
  };

  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const range = parseRange(req.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }
  const [start, end] = range ?? [0, size - 1];
  const body = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ path, { start, end })) as ReadableStream;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "content-length": String(end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
