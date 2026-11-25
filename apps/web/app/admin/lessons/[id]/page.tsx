import { DeleteLessonButton } from "../../../../components/admin/DeleteLessonButton";
import { getLanguage, locateMedia, missingNarration, topicInfo, type LanguageCode, type Lesson } from "@ai-tutor/shared";
import { recentVideoErrors } from "../../../../lib/videoErrors";
import { mediaErrorMessage } from "../../../../lib/mediaErrors";
import { statSync } from "node:fs";
import { AddClipsForm } from "../../../../components/admin/AddClipsForm";
import { PrerecordPanel } from "../../../../components/admin/PrerecordPanel";
import { VideoCueEditor, type VideoStepForEditor } from "../../../../components/admin/VideoCueEditor";
import { mediaExists, uploadedFilePath } from "../../../../lib/lessonMedia";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LessonPreview } from "../../../../components/admin/LessonPreview";
import { isAdmin } from "../../../../lib/adminAuth";
import { inr } from "../../../../lib/format";
import { loadDraft } from "../../../../lib/lessonDrafts";
import { changeTopic, publish, unpublish } from "../actions";
import { TopicFields } from "../../../../components/admin/TopicFields";
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
  searchParams: Promise<{ published?: string; unpublished?: string; error?: string; topic?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin");
  const { id } = await params;
  const q = await searchParams;
  const draft = await loadDraft(id);
  if (!draft) notFound();
  const { lesson } = draft;
  const cost = (draft.usage.promptTokens * IN_PER_M + draft.usage.completionTokens * OUT_PER_M) / 1e6;
  const langs = (["te", "hi", "en"] as LanguageCode[]).filter((l) => lesson.locales[l]);
  const videoSteps = lesson.steps.flatMap((s, index) => (s.type === "video" ? [{ s, index }] : []));
  const isVideoLesson = draft.kind === "video" || videoSteps.length > 0;
  const missing = missingNarration(lesson);
  const videoErrors = (await recentVideoErrors()).filter((e) => e.lessonId === lesson.id);
  const brokenSteps = [...new Map(videoErrors.map((e) => [e.stepId, e])).values()].filter((e) =>
    lesson.steps.some((s) => s.id === e.stepId && s.type === "video"),
  );
  const editorStep = (s: Extract<(typeof lesson.steps)[number], { type: "video" }>): VideoStepForEditor => ({
    id: s.id,
    source: s.source,
    ...(s.label ? { label: s.label } : {}),
    intro: Object.fromEntries(langs.map((l) => [l, lesson.locales[l]?.steps[s.id]?.text ?? ""])),
    cues: s.cues.map((c, i) => ({
      at: c.at,
      pause: c.pause,
      ...(c.point ? { point: c.point } : {}),
      ...(c.highlightBox ? { highlightBox: c.highlightBox } : {}),
      text: Object.fromEntries(langs.map((l) => [l, lesson.locales[l]?.steps[s.id]?.cues?.[i]?.text ?? ""])),
    })),
    mediaMissing: s.source.kind === "upload" && !mediaExists(s.source.src),
    mediaVersion: s.source.kind === "upload" ? mediaVersion(s.source.src) : undefined,
  });

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
      {q.topic && <p className="card">✅ Topic saved.</p>}
      {q.error && <p className="card err">Could not save: {q.error}</p>}
      {draft.status === "published" && draft.pendingChanges && (
        <p className="card">✏️ You changed this lesson after publishing. Learners still get the published version: publish again below to update it.</p>
      )}

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

      {brokenSteps.length > 0 && (
        <section className="card">
          <h2 className="video-flag">⚠ Videos that didn&apos;t play</h2>
          <p className="muted small">Reported by learners&apos; phones in the last 2 weeks. The narration still played without the video.</p>
          <ul className="small">
            {brokenSteps.map((e) => (
              <li key={e.stepId}>
                <a href={`#step-${e.stepId}`}>Step {lesson.steps.findIndex((st) => st.id === e.stepId) + 1}</a>: {mediaErrorMessage(e.code)} (last{" "}
                {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })})
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="card">
          <h2>Narration still to write</h2>
          <ul className="small">
            {[...new Set(missing.map((m) => `${m.stepId}|${m.lang}`))].map((k) => {
              const [stepId, lang] = k.split("|") as [string, LanguageCode];
              const n = missing.filter((m) => m.stepId === stepId && m.lang === lang).length;
              return (
                <li key={k}>
                  <a href={`#step-${stepId}`}>Step {lesson.steps.findIndex((st) => st.id === stepId) + 1}</a>: {n} cue(s) without{" "}
                  {getLanguage(lang).name.en} words
                </li>
              );
            })}
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
                    {s.type === "video" && `Plays ${s.label ?? "a video"} (${s.cues.length} cue${s.cues.length === 1 ? "" : "s"})`}
                  </td>
                  {langs.map((l) => {
                    const t = lesson.locales[l]!.steps[s.id];
                    return (
                      <td key={l} lang={l} className="step-text">
                        {[t?.text, t?.question, ...(t?.cues ?? []).map((c) => c.text)].filter(Boolean).join(" · ")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {videoSteps.map(({ s, index }) => (
        <VideoCueEditor
          key={`${s.id}-${sourceKey(s.source)}`}
          lessonId={lesson.id}
          step={editorStep(s)}
          index={index}
          langs={langs}
          canMoveUp={index > 0}
          canMoveDown={index < lesson.steps.length - 1}
        />
      ))}

      {isVideoLesson && <AddClipsForm lessonId={lesson.id} />}

      <section className="card stack">
        <h2>Topic</h2>
        <p className="muted small">
          Now in: {topicInfo(lesson.course).emoji} {topicInfo(lesson.course).name.en}. Changing the topic does not need a new review and
          applies to learners right away.
        </p>
        <form action={changeTopic} className="stack">
          <input type="hidden" name="id" value={lesson.id} />
          <TopicFields current={lesson.course} />
          <div>
            <button className="btn secondary" type="submit">
              Save topic
            </button>
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2>Publish</h2>
        <p className="muted small">
          Publishing makes this lesson available to every learner in Telugu, Hindi and English. The Telugu and Hindi were written by AI: have a
          native speaker read them when you can.
        </p>
        <div className="row">
          {(draft.status !== "published" || draft.pendingChanges) && (
            <form action={publish}>
              <input type="hidden" name="id" value={lesson.id} />
              <button className="btn" type="submit">
                {draft.status === "published" ? "✓ Publish the changes" : "✓ Publish for all learners"}
              </button>
            </form>
          )}
          {draft.status === "published" && (
            <form action={unpublish}>
              <input type="hidden" name="id" value={lesson.id} />
              <button className="btn secondary" type="submit">
                Hide from learners
              </button>
            </form>
          )}
          <DeleteLessonButton id={lesson.id} title={lesson.locales.en?.title ?? lesson.id} />
        </div>
      </section>

      <PrerecordPanel lessonId={lesson.id} published={draft.status === "published"} />
    </main>
  );
}

function sourceKey(src: Extract<(Lesson["steps"])[number], { type: "video" }>["source"]): string {
  return src.kind === "youtube" ? `yt-${src.videoId}` : `up-${src.src}-${mediaVersion(src.src) ?? ""}`;
}

/** The uploaded file's change time, used to refresh the editor's video after a re-upload. */
function mediaVersion(src: string): string | undefined {
  const loc = locateMedia(src);
  if (loc?.root !== "uploads") return undefined;
  const path = uploadedFilePath(loc.lessonId, loc.file);
  try {
    return path ? statSync(/* turbopackIgnore: true */ path).mtimeMs.toFixed(0) : undefined;
  } catch {
    return undefined;
  }
}
