import { isAdmin } from "../../../../lib/adminAuth";
import { listAssistantJobs, startAssistantJob } from "../../../../lib/assistant/jobs";
import { readSource, SourceError, type SourceText } from "../../../../lib/lessonSources";

/**
 * Admin only: the Lesson Assistant.
 *   POST form: message (what to make), file (optional PDF/DOCX/TXT/MD), videos/pictures ("0" to skip)
 *        → { jobId }; poll GET /api/admin/assistant/<jobId>
 *   GET  → recent requests
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a form." }, { status: 400 });
  }
  const message = String(form.get("message") ?? "").trim().slice(0, 2000);
  if (message.length < 3) return Response.json({ error: "Tell the assistant what lesson to make." }, { status: 400 });
  let document: SourceText | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      document = await readSource(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      if (err instanceof SourceError) return Response.json({ error: err.message }, { status: 400 });
      return Response.json({ error: "Could not read that file." }, { status: 400 });
    }
  }
  const job = startAssistantJob({ message, document, videos: form.get("videos") !== "0", pictures: form.get("pictures") !== "0" });
  return Response.json({ jobId: job.id });
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  return Response.json({
    jobs: listAssistantJobs().map((j) => ({ id: j.id, status: j.status, startedAt: j.startedAt, request: j.messages[0]?.text ?? "" })),
  });
}
