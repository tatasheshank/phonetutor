import type { LanguageCode } from "@ai-tutor/shared";
import { isAdmin } from "../../../../lib/adminAuth";
import { translateLines } from "../../../../lib/lessonGenerator";
import { SarvamError } from "../../../../lib/sarvamChat";

/**
 * Admin only: drafts Telugu or Hindi for short English lines (the cue editor's narration).
 * Body: { lines: string[], lang: "te" | "hi" }. Costs a few paise per call.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { lines?: unknown; lang?: unknown } | null;
  const lang = body?.lang === "te" || body?.lang === "hi" ? (body.lang as LanguageCode) : null;
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, 60).map((l) => (typeof l === "string" ? l.slice(0, 600) : "")) : null;
  if (!lang || !lines) return Response.json({ error: "Send lines and lang (te or hi)." }, { status: 400 });
  try {
    const { lines: out } = await translateLines(lines, lang);
    return Response.json({ lines: out });
  } catch (err) {
    console.error("[lessons] translate failed", err);
    return Response.json({ error: err instanceof SarvamError ? err.message : "Translation failed. Try again." }, { status: 502 });
  }
}
