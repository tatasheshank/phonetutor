import { isValidReport, recordVideoError } from "../../../lib/videoErrors";

/**
 * Players report a lesson video that couldn't play (e.g. a YouTube video made private or blocked
 * from embedding). Logged for the admin dashboard. Open to learners' browsers; input is validated
 * and repeats are dropped.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isValidReport(body)) return new Response(null, { status: 400 });
  await recordVideoError({ lessonId: body.lessonId, stepId: body.stepId, code: body.code });
  return new Response(null, { status: 204 });
}
