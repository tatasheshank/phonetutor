"use client";

import { byClipName, MAX_CLIP_BYTES } from "@ai-tutor/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { uploadClip, videoDuration } from "./uploadClip";

type Kind = "phone" | "video";

interface JobLesson {
  part: number;
  title: string;
  from: number;
  to: number;
  clips: number;
  status: "waiting" | "preparing" | "done" | "failed";
  lessonId?: string;
  error?: string;
}
interface Job {
  id: string;
  status: "outlining" | "preparing" | "done" | "failed";
  courseName: string;
  lessons: JobLesson[];
  clipTargets: Array<{ clip: number; lessonId: string; stepId: string }>;
  warnings: string[];
  error?: string;
}

/**
 * Course splitter: one long document (and, for computer topics, a folder of screen recordings)
 * becomes several lessons in order, under one course. Shows progress lesson by lesson, then
 * uploads each clip into the lesson it belongs to.
 */
export function NewCourseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("video");
  const [clips, setClips] = useState<File[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);
  const stopPolling = useRef<() => void>(() => {});

  useEffect(() => () => stopPolling.current(), []);

  function pickClips(list: FileList | null) {
    const files = [...(list ?? [])].sort((a, b) => byClipName(a.name, b.name));
    const tooBig = files.filter((f) => f.size > MAX_CLIP_BYTES);
    setError(tooBig.length ? `Too big (limit 50 MB each), left out: ${tooBig.map((f) => f.name).join(", ")}.` : null);
    setClips(files.filter((f) => f.size <= MAX_CLIP_BYTES));
  }

  /** Polls the job until it finishes. */
  function follow(jobId: string): Promise<Job> {
    return new Promise((resolve, reject) => {
      let stopped = false;
      stopPolling.current = () => {
        stopped = true;
      };
      const tick = async () => {
        if (stopped) return;
        try {
          const res = await fetch(`/api/admin/courses/${jobId}`, { cache: "no-store" });
          const data = (await res.json()) as Job & { error?: string };
          if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
          setJob(data);
          if (data.status === "done" || data.status === "failed") return resolve(data);
        } catch (err) {
          return reject(err);
        }
        setTimeout(tick, 2000);
      };
      void tick();
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setJob(null);
    setUploadFailures([]);
    const form = new FormData(e.currentTarget);
    form.delete("clipFiles");
    form.set("kind", kind);
    try {
      if (kind === "video") {
        setProgress("Reading clip lengths…");
        form.set("clips", JSON.stringify(await Promise.all(clips.map(async (f) => ({ name: f.name, duration: await videoDuration(f) })))));
      }
      setProgress("Reading the document and planning the lessons…");
      const res = await fetch("/api/admin/courses", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? `Failed (${res.status})`);

      setProgress(null);
      const finished = await follow(data.jobId);
      if (finished.status === "failed") throw new Error(finished.error ?? "Preparing the course failed.");

      // Clips go into the lessons the plan chose (same file-name order as the server used).
      if (kind === "video" && finished.clipTargets.length) {
        const failures: string[] = [];
        for (let i = 0; i < finished.clipTargets.length; i++) {
          const target = finished.clipTargets[i]!;
          const f = clips[target.clip];
          if (!f) continue;
          try {
            await uploadClip(target.lessonId, f, { stepId: target.stepId }, (pct) =>
              setProgress(`Uploading clip ${i + 1} of ${finished.clipTargets.length}: ${f.name} (${pct}%)`),
            );
          } catch (err) {
            failures.push(`${f.name}: ${(err as Error).message}`);
          }
        }
        setUploadFailures(failures);
      }
      setProgress(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="card stack">
        <h2>Split a document into a course</h2>
        <p className="muted small">
          Have a long guide, like &quot;Excel for beginners&quot;, with many recordings? The app splits it into short lessons in order (up to 12),
          prepares each one, and puts every clip into the right lesson.
        </p>
        <button className="btn secondary" onClick={() => setOpen(true)}>
          📚 Make a course
        </button>
      </section>
    );
  }

  const doneCount = job?.lessons.filter((l) => l.status === "done").length ?? 0;

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>Split a document into a course</h2>
      <div className="row kind-pick" role="radiogroup" aria-label="Kind of course">
        <button type="button" className={`btn ${kind === "video" ? "" : "secondary"}`} aria-pressed={kind === "video"} onClick={() => setKind("video")} disabled={busy}>
          🎬 Video course (computer)
        </button>
        <button type="button" className={`btn ${kind === "phone" ? "" : "secondary"}`} aria-pressed={kind === "phone"} onClick={() => setKind("phone")} disabled={busy}>
          📱 Phone course
        </button>
      </div>
      <label className="field">
        <span>Course document (PDF, DOCX, TXT, MD)</span>
        <input className="input" type="file" name="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown" disabled={busy} />
      </label>
      <label className="field">
        <span>Or paste the course text</span>
        <textarea className="input" name="text" rows={5} disabled={busy} placeholder="Paste the whole guide here: headings and steps." />
      </label>
      {kind === "video" && (
        <>
          <label className="field">
            <span>All the screen recordings for the course (choose them all at once)</span>
            <input
              className="input"
              type="file"
              name="clipFiles"
              multiple
              accept=".mp4,.webm,video/mp4,video/webm"
              disabled={busy}
              onChange={(e) => pickClips(e.currentTarget.files)}
            />
          </label>
          {clips.length > 0 && (
            <p className="small muted">
              {clips.length} clip(s), in this order: {clips.map((f) => f.name).join(" · ")}
            </p>
          )}
        </>
      )}
      <label className="field">
        <span>Course name (learners see it as the topic), e.g. &quot;Excel basics&quot;</span>
        <input className="input" type="text" name="course" maxLength={80} disabled={busy} />
      </label>
      {error && <p className="err">{error}</p>}
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Preparing the course…" : "Split into lessons"}
        </button>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {progress && <p className="small">{progress}</p>}

      {job && (
        <div className="stack">
          <p className="small">
            <strong>{job.courseName || "Course"}</strong>:{" "}
            {job.status === "outlining" ? "planning the lessons…" : `${doneCount} of ${job.lessons.length} lessons prepared`}
            {job.status === "done" && " ✓"}
          </p>
          <ol className="small course-progress">
            {job.lessons.map((l) => (
              <li key={l.part}>
                {l.status === "done" ? "✅" : l.status === "failed" ? "⚠" : l.status === "preparing" ? "⏳" : "·"}{" "}
                {l.lessonId ? <a href={`/admin/lessons/${l.lessonId}`}>{l.title}</a> : l.title}
                <span className="muted">
                  {" "}
                  (paragraphs {l.from}–{l.to}
                  {l.clips ? `, ${l.clips} clip${l.clips === 1 ? "" : "s"}` : ""})
                </span>
                {l.error && <span className="err"> {l.error}</span>}
              </li>
            ))}
          </ol>
          {job.status === "done" && !busy && (
            <p className="small">
              Done. The course is listed below: preview each lesson
              {kind === "video" ? ", set where the teacher points in each video" : ""}, then press &quot;Publish all&quot;.
            </p>
          )}
          {job.warnings.length > 0 && (
            <details className="small">
              <summary>{job.warnings.length} note(s) to check</summary>
              <ul>
                {job.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {uploadFailures.length > 0 && (
            <p className="err small" style={{ whiteSpace: "pre-line" }}>
              Some clips didn&apos;t upload; add them from those lessons&apos; pages:{"\n"}
              {uploadFailures.join("\n")}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
