import { isAdmin } from "../../../../lib/adminAuth";
import { saveDraft } from "../../../../lib/lessonDrafts";
import { generateLesson } from "../../../../lib/lessonGenerator";
import { normalizeText, readSource, SourceError, type SourceText } from "../../../../lib/lessonSources";
import { SarvamError } from "../../../../lib/sarvamChat";

// Reading a file and preparing three languages takes a while.
export const maxDuration = 300;

/**
 * Admin only: read a file (PDF, DOCX, TXT, MD) or typed text, prepare a lesson draft with Sarvam,
 * and return its id. Nothing reaches learners until the admin publishes it.
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
    const { lesson, warnings, usage } = await generateLesson(source, title);
    await saveDraft({
      id: lesson.id,
      status: "draft",
      createdAt: new Date().toISOString(),
      createdBy: "admin",
      source: { fileName: source.fileName, kind: source.kind, chars: source.text.length },
      warnings,
      usage,
      lesson,
    });
    console.log(`[lessons] prepared ${lesson.id} from ${source.fileName} in ${Math.round((Date.now() - started) / 1000)}s`);
    return Response.json({ id: lesson.id });
  } catch (err) {
    console.error("[lessons] preparing failed", err);
    const message = err instanceof SarvamError ? err.message : "Preparing the lesson failed. Please try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
