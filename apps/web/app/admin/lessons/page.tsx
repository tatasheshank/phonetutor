import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteLessonButton } from "../../../components/admin/DeleteLessonButton";
import { NewLessonForm } from "../../../components/admin/NewLessonForm";
import { isAdmin } from "../../../lib/adminAuth";
import { listDrafts } from "../../../lib/lessonDrafts";
import { listLessons } from "../../../lib/lessons";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lessons", robots: { index: false } };

export default async function LessonsAdminPage() {
  if (!(await isAdmin())) redirect("/admin");
  const [drafts, published] = await Promise.all([listDrafts(), listLessons()]);
  const draftIds = new Set(drafts.map((d) => d.id));
  const handWritten = published.filter((l) => !draftIds.has(l.id));

  return (
    <main className="admin" lang="en">
      <header className="admin-head">
        <div>
          <h1>Lessons</h1>
          <p className="muted small">
            <Link href="/admin">← Cost dashboard</Link>
          </p>
        </div>
      </header>

      <NewLessonForm />

      <section className="card">
        <h2>Prepared by the app</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lesson</th>
                <th>From</th>
                <th className="num">Steps</th>
                <th>Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/admin/lessons/${d.id}`}>{d.lesson.locales.en?.title ?? d.id}</Link>
                  </td>
                  <td className="muted">{d.source.fileName}</td>
                  <td className="num">{d.lesson.steps.length}</td>
                  <td>{d.warnings.length ? `⚠ ${d.warnings.length}` : "✓"}</td>
                  <td>
                    <div className="status-cell">
                      {d.status === "published" ? <span className="live">Published</span> : "Draft"}
                      <DeleteLessonButton id={d.id} title={d.lesson.locales.en?.title ?? d.id} small />
                    </div>
                  </td>
                </tr>
              ))}
              {drafts.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    None yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {handWritten.length > 0 && (
        <section className="card">
          <h2>Written by hand (content/lessons)</h2>
          <ul>
            {handWritten.map((l) => (
              <li key={l.id} className="lesson-li">
                <span>
                  {l.title.en ?? l.id} <span className="muted small">({l.reviewed.length ? `reviewed: ${l.reviewed.join(", ")}` : "draft"})</span>
                </span>
                <DeleteLessonButton id={l.id} title={l.title.en ?? l.id} small />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
