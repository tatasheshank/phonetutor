import { isLanguageCode, normalizeTopicId } from "@ai-tutor/shared";
import { allowDraftLessons, listLessons } from "../../../lib/lessons";

export const dynamic = "force-dynamic";

/** Lessons the learner can play in a language: reviewed ones, plus drafts when ALLOW_DRAFT_LESSONS=true. */
export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang");
  if (!isLanguageCode(lang)) return Response.json({ error: "lang required" }, { status: 400 });
  const drafts = allowDraftLessons();
  const lessons = (await listLessons())
    .filter((l) => l.reviewed.includes(lang) || (drafts && l.title[lang]))
    .map((l) => ({ id: l.id, title: l.title[lang]!, steps: l.steps, draft: !l.reviewed.includes(lang), topic: normalizeTopicId(l.course) }));
  return Response.json({ lessons });
}
