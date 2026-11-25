import { appendVideoStep, nextStepId, type Lesson } from "@ai-tutor/shared";
import { isAdmin } from "../../../../../../lib/adminAuth";
import { loadDraft, updateDraft } from "../../../../../../lib/lessonDrafts";
import { checkUpload, MediaError, saveUpload } from "../../../../../../lib/lessonMedia";

// A 50 MB clip over a slow connection takes a while.
export const maxDuration = 300;

/**
 * Admin only: upload ONE video clip or poster image to a lesson draft (the page sends several
 * clips one after another, which also keeps each request under tunnel and proxy size limits).
 *
 * Form fields:
 *   file    the video (MP4/WebM, up to 50 MB) or poster (PNG/JPG/WebP, up to 5 MB)
 *   stepId  optional: replace this video step's clip (or set its poster); without it, a new video step is added
 *   label   optional: the original file name, shown to admins
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const { id } = await params;
  const draft = await loadDraft(id);
  if (!draft) return Response.json({ error: "Lesson not found." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file." }, { status: 400 });
  const stepId = String(form.get("stepId") ?? "").trim();
  const label = String(form.get("label") ?? file.name).slice(0, 160);

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { kind, ext } = checkUpload(file.name, data);
    const step = stepId ? draft.lesson.steps.find((s) => s.id === stepId) : undefined;
    if (stepId && step?.type !== "video") throw new MediaError(`Step ${stepId} is not a video step.`);
    if (kind === "image" && !step) throw new MediaError("A poster image belongs to a video step: upload it from that video's editor.");

    let resultStepId = stepId;
    let lesson: Lesson;
    if (kind === "image") {
      const url = await saveUpload(id, `clip-${stepId}-poster`, ext, data);
      lesson = (await updateDraft(id, (l) => withStep(l, stepId, (s) => ({ ...s, poster: url })))).lesson;
    } else if (step) {
      const url = await saveUpload(id, `clip-${stepId}`, ext, data);
      lesson = (await updateDraft(id, (l) => withStep(l, stepId, (s) => ({ ...s, src: url, label })))).lesson;
    } else {
      // New step: its id decides the file name, so add the step first with the final URL.
      // The file is saved first; the step that points at it is added right after.
      const added = nextStepId(draft.lesson);
      const url = await saveUpload(id, `clip-${added}`, ext, data);
      lesson = (await updateDraft(id, (l) => appendVideoStep(l, { src: url, label }).lesson)).lesson;
      resultStepId = added;
    }
    console.log(`[lessons] ${id}: uploaded ${kind} "${file.name}" (${(file.size / 1048576).toFixed(1)} MB) for ${resultStepId}`);
    return Response.json({ ok: true, stepId: resultStepId, steps: lesson.steps.length });
  } catch (err) {
    if (err instanceof MediaError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[lessons] upload failed", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

type VideoStep = Extract<Lesson["steps"][number], { type: "video" }>;

function withStep(lesson: Lesson, stepId: string, change: (s: VideoStep) => VideoStep): Lesson {
  return {
    ...lesson,
    steps: lesson.steps.map((s) => (s.id === stepId && s.type === "video" ? change(s) : s)),
  };
}
