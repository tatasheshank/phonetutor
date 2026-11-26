import { ALL_LANGUAGE_CODES, setSlides, type Slide } from "@ai-tutor/shared";
import { isAdmin } from "../../../../../../lib/adminAuth";
import { generateSlides } from "../../../../../../lib/lessonGenerator";
import { loadDraft, updateDraft } from "../../../../../../lib/lessonDrafts";
import { SarvamError } from "../../../../../../lib/sarvamChat";

export const maxDuration = 120;

/**
 * Admin only: (re)makes the board slides of every talk step, from the teacher's lines, in every
 * language of the lesson. Pictures are kept. Costs a few paise of Sarvam credit.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const { id } = await params;
  const draft = await loadDraft(id);
  if (!draft) return Response.json({ error: "Lesson not found." }, { status: 404 });
  try {
    const made = await generateSlides(draft.lesson);
    // Only the slides are copied over, so edits made meanwhile are kept.
    await updateDraft(id, (l) => {
      let out = l;
      for (const lang of ALL_LANGUAGE_CODES) {
        const pack = made.lesson.locales[lang];
        if (!pack || !out.locales[lang]) continue;
        const slides: Record<string, Slide> = {};
        for (const [stepId, s] of Object.entries(pack.steps)) if (s.slide) slides[stepId] = s.slide;
        out = setSlides(out, lang, slides);
      }
      return out;
    });
    console.log(`[lessons] ${id}: ${made.count} board slides made`);
    return Response.json({ ok: true, count: made.count });
  } catch (err) {
    console.error("[lessons] slides failed", err);
    return Response.json({ error: err instanceof SarvamError ? err.message : "Couldn't make the slides. Try again." }, { status: 502 });
  }
}
