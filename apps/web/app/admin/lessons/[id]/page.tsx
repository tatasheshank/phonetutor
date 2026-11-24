import { DeleteLessonButton } from "../../../../components/admin/DeleteLessonButton";
import { getLanguage, type LanguageCode } from "@ai-tutor/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LessonPreview } from "../../../../components/admin/LessonPreview";
import { isAdmin } from "../../../../lib/adminAuth";
import { inr } from "../../../../lib/format";
import { loadDraft } from "../../../../lib/lessonDrafts";
import { publish, unpublish } from "../actions";
import "../../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lesson preview", robots: { index: false } };

// Sarvam 105B list prices (₹ per million tokens), for a rough cost of preparing the lesson.
const IN_PER_M = 10;
const OUT_PER_M = 25;

export default async function LessonDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string; unpublished?: string; error?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin");
  const { id } = await params;
  const q = await searchParams;
  const draft = await loadDraft(id);
  if (!draft) notFound();
  const { lesson } = draft;
  const cost = (draft.usage.promptTokens * IN_PER_M + draft.usage.completionTokens * OUT_PER_M) / 1e6;
  const langs = (["te", "hi", "en"] as LanguageCode[]).filter((l) => lesson.locales[l]);

  return (
    <main className="admin" lang="en">
      <header className="admin-head">
        <div>
          <h1>{lesson.locales.en?.title ?? lesson.id}</h1>
          <p className="muted small">
            <Link href="/admin/lessons">← Lessons</Link> · from {draft.source.fileName} ({draft.source.chars.toLocaleString("en-IN")} characters) ·
            prepared {new Date(draft.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })} · AI
            cost about {inr(cost)}
          </p>
        </div>
        <span className={draft.status === "published" ? "live" : "muted"}>{draft.status === "published" ? "● Published" : "Draft"}</span>
      </header>

      {q.published && <p className="card">✅ Published. Learners can pick this lesson now.</p>}
      {q.unpublished && <p className="card">Hidden from learners. You can publish it again.</p>}
      {q.error && <p className="card err">Could not publish: {q.error}</p>}

      {draft.warnings.length > 0 && (
        <section className="card">
          <h2>Please check</h2>
          <ul>
            {draft.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Preview the demonstration</h2>
        <p className="muted small">Exactly what learners see, one teacher line at a time. Voice is added when the lesson plays.</p>
        <LessonPreview lesson={lesson} />
      </section>

      <section className="card">
        <h2>All steps</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>What happens</th>
                {langs.map((l) => (
                  <th key={l}>{getLanguage(l).name.native}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lesson.steps.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td className="small">
                    {s.type === "say" && "Teacher explains"}
                    {s.type === "show" && `Shows ${s.screen}${s.highlight ? `, points at ${s.highlight}` : ""}`}
                    {s.type === "practice" && `On ${s.screen}, points at and presses ${s.expect.tap}`}
                    {s.type === "check" && "Asks: did you understand?"}
                    {s.type === "video" && "Plays a video"}
                  </td>
                  {langs.map((l) => {
                    const t = lesson.locales[l]!.steps[s.id];
                    return (
                      <td key={l} lang={l} className="step-text">
                        {t?.text ?? t?.question ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <h2>Publish</h2>
        <p className="muted small">
          Publishing makes this lesson available to every learner in Telugu, Hindi and English. The Telugu and Hindi were written by AI: have a
          native speaker read them when you can.
        </p>
        <div className="row">
          {draft.status === "published" ? (
            <form action={unpublish}>
              <input type="hidden" name="id" value={lesson.id} />
              <button className="btn secondary" type="submit">
                Hide from learners
              </button>
            </form>
          ) : (
            <form action={publish}>
              <input type="hidden" name="id" value={lesson.id} />
              <button className="btn" type="submit">
                ✓ Publish for all learners
              </button>
            </form>
          )}
          <DeleteLessonButton id={lesson.id} title={lesson.locales.en?.title ?? lesson.id} />
        </div>
      </section>
    </main>
  );
}
