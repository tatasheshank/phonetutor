import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteLessonButton } from "../../../components/admin/DeleteLessonButton";
import { NewCourseForm } from "../../../components/admin/NewCourseForm";
import { NewLessonForm } from "../../../components/admin/NewLessonForm";
import { publishCourse } from "./actions";
import type { LessonDraft } from "../../../lib/lessonDrafts";
import { isAdmin } from "../../../lib/adminAuth";
import { listDrafts } from "../../../lib/lessonDrafts";
import { listLessons } from "../../../lib/lessons";
import { topicInfo } from "@ai-tutor/shared";
import { recentVideoErrors } from "../../../lib/videoErrors";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lessons", robots: { index: false } };

export default async function LessonsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ coursePublished?: string; courseError?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin");
  const q = await searchParams;
  const [drafts, published, videoErrors] = await Promise.all([listDrafts(), listLessons(), recentVideoErrors()]);
  const brokenVideos = new Map<string, number>();
  for (const e of videoErrors) brokenVideos.set(e.lessonId, (brokenVideos.get(e.lessonId) ?? 0) + 1);
  const draftIds = new Set(drafts.map((d) => d.id));
  const handWritten = published.filter((l) => !draftIds.has(l.id));
  // Lessons made by the course splitter, grouped by course, in order.
  const courses = new Map<string, LessonDraft[]>();
  for (const d of drafts) if (d.series) courses.set(d.series.id, [...(courses.get(d.series.id) ?? []), d]);
  for (const list of courses.values()) list.sort((a, b) => a.series!.part - b.series!.part);
  const singles = drafts.filter((d) => !d.series);

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
      <NewCourseForm />

      {q.coursePublished && <p className="card">✅ Published {q.coursePublished} lesson(s). Learners can find them under the course&apos;s topic.</p>}
      {q.courseError && <p className="card err">Some lessons couldn&apos;t be published: {q.courseError}</p>}

      {[...courses.entries()].map(([seriesId, list]) => {
        const first = list[0]!;
        const toPublish = list.filter((d) => d.status !== "published" || d.pendingChanges).length;
        const live = list.filter((d) => d.status === "published").length;
        return (
          <section className="card stack" key={seriesId} id={seriesId}>
            <header className="cue-head">
              <h2>
                📚 {first.series!.name} <span className="muted small">({list.length} of {first.series!.total} lessons · {live} published)</span>
              </h2>
              {toPublish > 0 && (
                <form action={publishCourse}>
                  <input type="hidden" name="seriesId" value={seriesId} />
                  <button className="btn" type="submit">
                    ✓ Publish {toPublish === list.length ? "all" : toPublish} lesson{toPublish === 1 ? "" : "s"}
                  </button>
                </form>
              )}
            </header>
            <p className="muted small">
              Topic for learners: {topicInfo(first.lesson.course).emoji} {topicInfo(first.lesson.course).name.en}. Preview each lesson, set the pointers in its
              videos, then publish. Lessons play in this order.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Lesson</th>
                    <th>From the document</th>
                    <th className="num">Steps</th>
                    <th>Notes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id}>
                      <td className="num">{d.series!.part}</td>
                      <td>
                        <Link href={`/admin/lessons/${d.id}`}>{d.lesson.locales.en?.title ?? d.id}</Link>
                      </td>
                      <td className="muted small">{d.source.chars.toLocaleString("en-IN")} characters</td>
                      <td className="num">{d.lesson.steps.length}</td>
                      <td>
                        {d.warnings.length ? `⚠ ${d.warnings.length}` : "✓"}
                        {brokenVideos.has(d.id) && <span className="video-flag"> · 🎬 video broken</span>}
                      </td>
                      <td>
                        <div className="status-cell">
                          {d.status === "published" ? <span className="live">{d.pendingChanges ? "Published (edited)" : "Published"}</span> : "Draft"}
                          <DeleteLessonButton id={d.id} title={d.lesson.locales.en?.title ?? d.id} small />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="card">
        <h2>Prepared by the app</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lesson</th>
                <th>Topic</th>
                <th>From</th>
                <th className="num">Steps</th>
                <th>Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {singles.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/admin/lessons/${d.id}`}>{d.lesson.locales.en?.title ?? d.id}</Link>
                  </td>
                  <td>
                    {topicInfo(d.lesson.course).emoji} {topicInfo(d.lesson.course).name.en}
                  </td>
                  <td className="muted">{d.source.fileName}</td>
                  <td className="num">{d.lesson.steps.length}</td>
                  <td>
                    {d.warnings.length ? `⚠ ${d.warnings.length}` : "✓"}
                    {brokenVideos.has(d.id) && <span className="video-flag"> · 🎬 video broken</span>}
                  </td>
                  <td>
                    <div className="status-cell">
                      {d.status === "published" ? <span className="live">Published</span> : "Draft"}
                      <DeleteLessonButton id={d.id} title={d.lesson.locales.en?.title ?? d.id} small />
                    </div>
                  </td>
                </tr>
              ))}
              {singles.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
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
                  {l.title.en ?? l.id} <span className="muted small">({topicInfo(l.course).name.en} · {l.reviewed.length ? `reviewed: ${l.reviewed.join(", ")}` : "draft"})</span>
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
