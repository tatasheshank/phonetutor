import { appendVideoStep, parseYouTubeId, type Lesson } from "@ai-tutor/shared";
import { isAdmin } from "../../../../../../lib/adminAuth";
import { loadDraft, updateDraft } from "../../../../../../lib/lessonDrafts";

/**
 * Admin only: use a YouTube video as a board video, instead of uploading.
 * Body: { url, stepId? }. Without stepId a new video step is added (before the final question);
 * with it, that step's video is switched to YouTube (its cues are kept).
 * Only the 11-character video id is stored. YouTube's public oEmbed endpoint is asked for the title,
 * which also tells us early if the video is private or blocks embedding.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const { id } = await params;
  const draft = await loadDraft(id);
  if (!draft) return Response.json({ error: "Lesson not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { url?: unknown; stepId?: unknown } | null;
  const videoId = typeof body?.url === "string" ? parseYouTubeId(body.url) : null;
  if (!videoId) {
    return Response.json({ error: "That isn't a YouTube video link. Paste a link like https://youtu.be/… or https://www.youtube.com/watch?v=…" }, { status: 400 });
  }
  const stepId = typeof body?.stepId === "string" ? body.stepId : "";
  if (stepId && draft.lesson.steps.find((s) => s.id === stepId)?.type !== "video") {
    return Response.json({ error: "That step is not a video step." }, { status: 400 });
  }

  const check = await checkEmbeddable(videoId);
  if (check.status === "blocked") return Response.json({ error: check.message }, { status: 400 });
  const label = (check.title ?? `YouTube ${videoId}`).slice(0, 160);

  let newStepId = stepId;
  await updateDraft(id, (l: Lesson) => {
    if (stepId) {
      return { ...l, steps: l.steps.map((s) => (s.id === stepId && s.type === "video" ? { ...s, source: { kind: "youtube", videoId }, label } : s)) };
    }
    const added = appendVideoStep(l, { source: { kind: "youtube", videoId }, label });
    newStepId = added.stepId;
    return added.lesson;
  });
  console.log(`[lessons] ${id}: YouTube ${videoId} for ${newStepId}`);
  return Response.json({ ok: true, stepId: newStepId, title: check.title ?? null, warning: check.status === "unknown" ? check.message : null });
}

type EmbedCheck = { status: "ok"; title?: string } | { status: "blocked"; message: string } | { status: "unknown"; message: string; title?: undefined };

/** Asks YouTube's oEmbed endpoint about the video (no key needed, nothing personal sent). */
async function checkEmbeddable(videoId: string): Promise<EmbedCheck> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "user-agent": "ai-tutor-admin" } });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { title?: unknown };
      return { status: "ok", ...(typeof data.title === "string" ? { title: data.title } : {}) };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: "blocked", message: "This video's owner doesn't allow it to be shown inside other apps. Use another video, or upload your own." };
    }
    if (res.status === 404 || res.status === 400) {
      return { status: "blocked", message: "YouTube can't find this video: it may be private, removed, or the link is wrong. Unlisted videos work; private ones don't." };
    }
    return { status: "unknown", message: `YouTube didn't confirm the video (HTTP ${res.status}). Check it plays in the preview.` };
  } catch {
    return { status: "unknown", message: "Couldn't reach YouTube to check the video. Check it plays in the preview." };
  }
}
