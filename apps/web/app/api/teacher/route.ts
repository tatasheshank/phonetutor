import { liveReady, loadTeacher, publicTeacher } from "../../../lib/teacher";

export const dynamic = "force-dynamic";

/** Public: how the teacher can look (default look, the photo's URL, and whether the free live teacher is available now). */
export async function GET() {
  const s = await loadTeacher();
  return Response.json(publicTeacher(s, await liveReady(s)), { headers: { "cache-control": "no-store" } });
}
