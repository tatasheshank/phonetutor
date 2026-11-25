import { byClipName, extensionOf, VIDEO_EXTENSIONS } from "@ai-tutor/shared";
import { isAdmin } from "../../../../lib/adminAuth";
import { startCourseJob } from "../../../../lib/courseJobs";
import type { ClipInfo } from "../../../../lib/lessonGenerator";
import { normalizeText, readSource, SourceError, type SourceText } from "../../../../lib/lessonSources";

/**
 * Admin only: split one long document (PDF, DOCX, TXT, MD or typed) into a course of lessons.
 * Form fields: file | text, kind ("phone" | "video"), course (name, optional), clips (JSON list of
 * {name, duration} for video courses; up to 60, sorted by file name).
 * Returns { jobId } at once; poll GET /api/admin/courses/<jobId> for progress and clip upload targets.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a form upload." }, { status: 400 });
  }
  const file = form.get("file");
  const typed = String(form.get("text") ?? "").trim();
  const kind = form.get("kind") === "video" ? "video" : "phone";
  const courseName = String(form.get("course") ?? "").trim().slice(0, 80);

  let clips: ClipInfo[] = [];
  if (kind === "video") {
    try {
      const list = JSON.parse(String(form.get("clips") ?? "[]")) as unknown;
      if (!Array.isArray(list)) throw new Error("Bad clip list.");
      if (list.length > 60) throw new Error("At most 60 clips per course. Split it into two courses.");
      clips = list
        .map((c) => {
          const name = String((c as { name?: unknown }).name ?? "").slice(0, 160);
          const ext = extensionOf(name);
          if (!(VIDEO_EXTENSIONS as readonly string[]).includes(ext)) throw new Error(`"${name}" is not an MP4 or WebM video.`);
          const d = Number((c as { duration?: unknown }).duration);
          return { name, ext: ext as ClipInfo["ext"], duration: Number.isFinite(d) && d > 0 && d < 3600 ? d : null };
        })
        .sort((a, b) => byClipName(a.name, b.name));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  let source: SourceText;
  try {
    if (file instanceof File && file.size > 0) {
      source = await readSource(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
    } else if (typed.length >= 80) {
      source = { kind: "text", fileName: "typed description", text: normalizeText(typed), warnings: [] };
    } else {
      return Response.json({ error: "Choose the course document, or paste its text (a few paragraphs at least)." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof SourceError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[course] reading file failed", err);
    return Response.json({ error: "Could not read that file." }, { status: 400 });
  }

  const job = startCourseJob(source, { kind, clips, courseName });
  return Response.json({ jobId: job.id });
}
