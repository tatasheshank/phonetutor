"use client";

import { byClipName, MAX_CLIP_BYTES } from "@ai-tutor/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { uploadClip, videoDuration } from "./uploadClip";

type Kind = "phone" | "video";

/**
 * Admin form: a file or a typed description in, an AI-prepared lesson draft out.
 * Phone lessons use the built-in WhatsApp screens. Video lessons (computer topics such as Excel)
 * use the admin's own screen recordings: one board video per clip, in file-name order.
 */
export function NewLessonForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("phone");
  const [clips, setClips] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  function pickClips(list: FileList | null) {
    const files = [...(list ?? [])].sort((a, b) => byClipName(a.name, b.name));
    const tooBig = files.filter((f) => f.size > MAX_CLIP_BYTES);
    setError(tooBig.length ? `Too big (limit 50 MB each): ${tooBig.map((f) => f.name).join(", ")}. Trim or compress them.` : null);
    setClips(files.filter((f) => f.size <= MAX_CLIP_BYTES));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.delete("clipFiles");
    form.set("kind", kind);
    try {
      if (kind === "video") {
        setProgress("Reading clip lengths…");
        const info = await Promise.all(clips.map(async (f) => ({ name: f.name, duration: await videoDuration(f) })));
        form.set("clips", JSON.stringify(info));
      }
      setProgress(kind === "video" ? "Planning the lesson and writing it in three languages…" : null);
      const res = await fetch("/api/admin/lessons", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { id?: string; clipSteps?: string[]; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? `Failed (${res.status})`);

      if (kind === "video" && clips.length) {
        const steps = data.clipSteps ?? [];
        const failed: string[] = [];
        for (let i = 0; i < clips.length; i++) {
          const f = clips[i]!;
          if (!steps[i]) break;
          try {
            await uploadClip(data.id, f, { stepId: steps[i] }, (pct) =>
              setProgress(`Uploading clip ${i + 1} of ${clips.length}: ${f.name} (${pct}%)`),
            );
          } catch (err) {
            failed.push(`${f.name}: ${(err as Error).message}`);
          }
        }
        if (failed.length) {
          // The draft exists: open it anyway, the page shows which clips are missing.
          alert(`Some clips didn't upload. Upload them again from the lesson page.\n\n${failed.join("\n")}`);
        }
      }
      router.push(`/admin/lessons/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>Add a lesson</h2>
      <div className="row kind-pick" role="radiogroup" aria-label="Kind of lesson">
        <button type="button" className={`btn ${kind === "phone" ? "" : "secondary"}`} aria-pressed={kind === "phone"} onClick={() => setKind("phone")} disabled={busy}>
          📱 Phone lesson
        </button>
        <button type="button" className={`btn ${kind === "video" ? "" : "secondary"}`} aria-pressed={kind === "video"} onClick={() => setKind("video")} disabled={busy}>
          🎬 Video lesson (computer)
        </button>
      </div>
      {kind === "phone" ? (
        <p className="muted small">
          Give a PDF, Word (.docx) or text file that explains a phone task, or describe it below. The app reads it, plans the teacher&apos;s
          demonstration on the built-in WhatsApp screens, and writes it in Telugu, Hindi and English. You preview it before learners see it.
        </p>
      ) : (
        <p className="muted small">
          For computer topics such as Excel. Give the steps (a file or typed), and your screen recordings (MP4 or WebM, up to 50 MB each). Clips play
          in file-name order, so number them: <code>01 open excel.mp4</code>, <code>02 type numbers.mp4</code>… The app drafts the teacher&apos;s
          narration in three languages; then you set where she points in each clip.
        </p>
      )}
      <label className="field">
        <span>{kind === "video" ? "Steps document (PDF, DOCX, TXT, MD)" : "File (PDF, DOCX, TXT, MD; up to 10 MB)"}</span>
        <input className="input" type="file" name="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown" disabled={busy} />
      </label>
      <label className="field">
        <span>Or describe the lesson</span>
        <textarea
          className="input"
          name="text"
          rows={4}
          disabled={busy}
          placeholder={
            kind === "video"
              ? "e.g. Open Excel from the Start menu. Click a cell and type numbers. Select them and press AutoSum. Save the file."
              : "e.g. How to make a WhatsApp video call to your son, and how to end it."
          }
        />
      </label>
      {kind === "video" && (
        <>
          <label className="field">
            <span>Screen recordings (choose several at once)</span>
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
            <ol className="small clip-list">
              {clips.map((f) => (
                <li key={f.name}>
                  {f.name} <span className="muted">({(f.size / 1048576).toFixed(1)} MB)</span>
                </li>
              ))}
            </ol>
          )}
          <label className="field">
            <span>Course (optional, groups lessons, e.g. &quot;Excel basics&quot;)</span>
            <input className="input" type="text" name="course" maxLength={80} disabled={busy} />
          </label>
        </>
      )}
      <label className="field">
        <span>Title (optional)</span>
        <input className="input" type="text" name="title" maxLength={120} disabled={busy} />
      </label>
      {error && <p className="err">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? `Preparing… ${seconds}s` : "Prepare lesson"}
      </button>
      {busy && <p className="muted small">{progress ?? "This usually takes under a minute."}</p>}
    </form>
  );
}
