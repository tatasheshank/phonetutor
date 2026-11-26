import { setStepImage } from "@ai-tutor/shared";
import { isAdmin } from "../../../../../../../lib/adminAuth";
import { loadDraft, updateDraft } from "../../../../../../../lib/lessonDrafts";
import { checkUpload, MediaError, saveUpload } from "../../../../../../../lib/lessonMedia";

/**
 * Admin only: the board picture of one talk step.
 *   POST   form: file (PNG/JPG/WebP, up to 5 MB), credit (optional: where the picture is from)
 *   DELETE remove the picture (the file stays until the lesson is deleted)
 */
type Ctx = { params: Promise<{ id: string; stepId: string }> };

async function talkStep(ctx: Ctx) {
  if (!(await isAdmin())) return { error: Response.json({ error: "Sign in as admin first." }, { status: 401 }) };
  const { id, stepId } = await ctx.params;
  const draft = await loadDraft(id);
  if (!draft) return { error: Response.json({ error: "Lesson not found." }, { status: 404 }) };
  if (draft.lesson.steps.find((s) => s.id === stepId)?.type !== "say") {
    return { error: Response.json({ error: "Pictures go on talk steps only." }, { status: 400 }) };
  }
  return { id, stepId };
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await talkStep(ctx);
  if ("error" in g) return g.error;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a picture." }, { status: 400 });
  const credit = String(form.get("credit") ?? "").trim().slice(0, 200);
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { kind, ext } = checkUpload(file.name, data);
    if (kind !== "image") throw new MediaError("Choose a picture (PNG, JPG or WebP).");
    const src = await saveUpload(g.id, `pic-${g.stepId}`, ext, data);
    await updateDraft(g.id, (l) => setStepImage(l, g.stepId, { src, ...(credit ? { credit } : {}) }));
    return Response.json({ ok: true, src });
  } catch (err) {
    if (err instanceof MediaError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[lessons] picture upload failed", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await talkStep(ctx);
  if ("error" in g) return g.error;
  await updateDraft(g.id, (l) => setStepImage(l, g.stepId, null));
  return Response.json({ ok: true });
}
