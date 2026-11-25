import { isAdmin } from "../../../../lib/adminAuth";
import { saveDraft } from "../../../../lib/lessonDrafts";
import { byClipName, extensionOf, VIDEO_EXTENSIONS } from "@ai-tutor/shared";
import { generateLesson, generateVideoLesson, type ClipInfo } from "../../../../lib/lessonGenerator";
import { normalizeText, readSource, SourceError, type SourceText } from "../../../../lib/lessonSources";
import { SarvamError } from "../../../../lib/sarvamChat";

// Reading a file and preparing three languages takes a while.
export const maxDuration = 300;

/**
 * Admin only: read a file (PDF, DOCX, TXT, MD) or typed text, prepare a lesson draft with Sarvam,
 * and return its id. Nothing reaches learners until the admin publishes it.
 *
 * kind=video (computer topics): also send "clips", a JSON list of {name, duration} for the screen
 * recordings. The draft gets one board-video step per clip; the page then uploads each clip to its
 * step (returned as "clipSteps", in the same order). No phone screens are used.
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
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || undefined;
  const kind = form.get("kind") === "video" ? "video" : "phone";
  const course = String(form.get("course") ?? "").trim().slice(0, 80) || undefined;
  let clips: ClipInfo[] = [];
  if (kind === "video") {
    try {
      clips = parseClips(String(form.get("clips") ?? "[]"));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  let source: SourceText;
  try {
    if (file instanceof File && file.size > 0) {
      source = await readSource(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
    } else if (typed.length >= 20) {
      source = { kind: "text", fileName: "typed description", text: normalizeText(typed), warnings: [] };
    } else {
      return Response.json({ error: "Choose a file, or describe the lesson in a few sentences." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof SourceError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[lessons] reading file failed", err);
    return Response.json({ error: "Could not read that file." }, { status: 400 });
  }

  try {
    const started = Date.now();
    const { lesson, warnings, usage } =
      kind === "video" ? await generateVideoLesson(source, clips, { title, course }) : await generateLesson(source, title);
    await saveDraft({
      id: lesson.id,
      status: "draft",
      createdAt: new Date().toISOString(),
      createdBy: "admin",
      source: { fileName: source.fileName, kind: source.kind, chars: source.text.length },
      warnings,
      usage,
      lesson,
      kind,
    });
    console.log(`[lessons] prepared ${lesson.id} from ${source.fileName} in ${Math.round((Date.now() - started) / 1000)}s`);
    // Video steps in clip order: the page uploads clip i to clipSteps[i].
    const clipSteps = lesson.steps.filter((s) => s.type === "video").map((s) => s.id);
    return Response.json({ id: lesson.id, clipSteps });
  } catch (err) {
    console.error("[lessons] preparing failed", err);
    const message = err instanceof SarvamError ? err.message : "Preparing the lesson failed. Please try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}

/** The clip list from the form: sorted by file name, as the recordings are numbered. */
function parseClips(raw: string): ClipInfo[] {
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error("Bad clip list.");
  }
  if (!Array.isArray(list)) throw new Error("Bad clip list.");
  if (list.length > 25) throw new Error("At most 25 clips per lesson. Split the topic into several lessons.");
  return list
    .map((c) => {
      const name = String((c as { name?: unknown }).name ?? "").slice(0, 160);
      const ext = extensionOf(name);
      if (!(VIDEO_EXTENSIONS as readonly string[]).includes(ext)) throw new Error(`"${name}" is not an MP4 or WebM video.`);
      const d = Number((c as { duration?: unknown }).duration);
      return { name, ext: ext as ClipInfo["ext"], duration: Number.isFinite(d) && d > 0 && d < 3600 ? d : null };
    })
    .sort((a, b) => byClipName(a.name, b.name));
}
