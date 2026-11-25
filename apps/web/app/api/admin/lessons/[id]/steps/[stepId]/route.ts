import { moveStep, removeStep, setVideoCues, type CueEdit, type LanguageCode } from "@ai-tutor/shared";
import { isAdmin } from "../../../../../../../lib/adminAuth";
import { loadDraft, updateDraft } from "../../../../../../../lib/lessonDrafts";

/**
 * Admin only: edit one step of a lesson draft.
 *   PUT    { cues: CueEdit[], intro?: {te,hi,en} }  save a video step's cues and narration
 *   PATCH  { move: -1 | 1 }                          move the step up or down
 *   DELETE                                           remove the step
 * Every edit puts the languages back to draft (they need review before publishing again).
 */

type Ctx = { params: Promise<{ id: string; stepId: string }> };

async function guard(ctx: Ctx) {
  if (!(await isAdmin())) return { error: Response.json({ error: "Sign in as admin first." }, { status: 401 }) };
  const { id, stepId } = await ctx.params;
  const draft = await loadDraft(id);
  if (!draft) return { error: Response.json({ error: "Lesson not found." }, { status: 404 }) };
  if (!draft.lesson.steps.some((s) => s.id === stepId)) return { error: Response.json({ error: "Step not found." }, { status: 404 }) };
  return { id, stepId };
}

const LANGS: LanguageCode[] = ["te", "hi", "en"];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const text = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const perLang = (v: unknown, max = 600): Partial<Record<LanguageCode, string>> => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(LANGS.map((l) => [l, text(o[l], max)]));
};

/** Reads cue edits from untrusted JSON; drops anything malformed. */
function parseCues(raw: unknown): CueEdit[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).flatMap((c): CueEdit[] => {
    const at = num((c as { at?: unknown }).at);
    if (!(at >= 0 && at < 3600)) return [];
    const p = (c as { point?: { x?: unknown; y?: unknown } }).point;
    const b = (c as { highlightBox?: { x?: unknown; y?: unknown; w?: unknown; h?: unknown } }).highlightBox;
    const point = p && Number.isFinite(num(p.x)) && Number.isFinite(num(p.y)) ? { x: num(p.x), y: num(p.y) } : undefined;
    const box =
      b && [b.x, b.y, b.w, b.h].every((n) => Number.isFinite(num(n))) ? { x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h) } : undefined;
    return [
      {
        at,
        pause: (c as { pause?: unknown }).pause !== false,
        ...(point ? { point } : {}),
        ...(box ? { highlightBox: box } : {}),
        text: perLang((c as { text?: unknown }).text),
        caption: perLang((c as { caption?: unknown }).caption, 160),
      },
    ];
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => null)) as { cues?: unknown; intro?: unknown } | null;
  const cues = parseCues(body?.cues);
  if (cues.length === 0) return Response.json({ error: "Add at least one cue." }, { status: 400 });
  try {
    await updateDraft(g.id, (l) => setVideoCues(l, g.stepId, cues, perLang(body?.intro)));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => null)) as { move?: unknown } | null;
  const by = body?.move === -1 ? -1 : body?.move === 1 ? 1 : null;
  if (!by) return Response.json({ error: "Nothing to change." }, { status: 400 });
  await updateDraft(g.id, (l) => moveStep(l, g.stepId, by));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  try {
    await updateDraft(g.id, (l) => removeStep(l, g.stepId));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
