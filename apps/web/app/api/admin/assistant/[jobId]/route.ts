import { isAdmin } from "../../../../../lib/adminAuth";
import { getAssistantJob } from "../../../../../lib/assistant/jobs";

export const dynamic = "force-dynamic";

/** Admin only: progress of a Lesson Assistant request (see POST /api/admin/assistant). */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const { jobId } = await params;
  const job = /^[a-f0-9]{12}$/.test(jobId) ? getAssistantJob(jobId) : undefined;
  if (!job) return Response.json({ error: "This request isn't running any more (the server may have restarted)." }, { status: 404 });
  return Response.json({ ...job, youtubeKey: Boolean(process.env.YOUTUBE_API_KEY) });
}
