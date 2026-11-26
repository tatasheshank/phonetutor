import { PRICES } from "@ai-tutor/shared";
import { isAdmin } from "../../../../../../lib/adminAuth";
import type { Usage } from "../../../../../../lib/assistant/ai";
import { addPictures } from "../../../../../../lib/assistant/pictures";
import { addVideos, YouTubeKeyMissing } from "../../../../../../lib/assistant/videos";
import { loadDraft } from "../../../../../../lib/lessonDrafts";

export const maxDuration = 300;

/**
 * Admin only: the Lesson Assistant for one lesson. Body { what: "pictures" | "videos" }.
 * Pictures: free ones from Wikimedia Commons for talk steps that have none yet.
 * Videos: up to two YouTube videos with narration (needs YOUTUBE_API_KEY).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const { id } = await params;
  const draft = await loadDraft(id);
  if (!draft) return Response.json({ error: "Lesson not found." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { what?: unknown } | null;
  const what = body?.what === "videos" ? "videos" : "pictures";
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const track = (u: Usage) => {
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
  };
  const notes: string[] = [];
  const request = { course: draft.series?.name ?? draft.lesson.course, subject: draft.series?.name ?? null };
  try {
    const added =
      what === "videos"
        ? (await addVideos(id, request, track, (t) => notes.push(t))).map((v) => v.title)
        : (await addPictures(id, request, track, (t) => notes.push(t))).map((p) => p.title);
    const price = PRICES.llmPerToken["sarvam-105b-conversations"]!;
    const costInr = usage.promptTokens * price.input + usage.completionTokens * price.output;
    return Response.json({ ok: true, added, notes, costInr });
  } catch (err) {
    if (err instanceof YouTubeKeyMissing) {
      return Response.json({ error: "Videos need a free YouTube Data API key (YOUTUBE_API_KEY in apps/web/.env.local)." }, { status: 400 });
    }
    console.error(`[lessons] find ${what} failed`, err);
    return Response.json({ error: (err as Error).message || "Search failed." }, { status: 502 });
  }
}
