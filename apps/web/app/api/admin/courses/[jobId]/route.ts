import { isAdmin } from "../../../../../lib/adminAuth";
import { getCourseJob } from "../../../../../lib/courseJobs";

export const dynamic = "force-dynamic";

/** Admin only: progress of a course-splitter job (see POST /api/admin/courses). */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const { jobId } = await params;
  const job = /^[a-f0-9]{12}$/.test(jobId) ? getCourseJob(jobId) : undefined;
  if (!job) return Response.json({ error: "This course job isn't running any more (the server may have restarted)." }, { status: 404 });
  return Response.json(job);
}
