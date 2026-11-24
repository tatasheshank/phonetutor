"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Admin form: a file or a typed description in, an AI-prepared lesson draft out. */
export function NewLessonForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lessons", { method: "POST", body: new FormData(e.currentTarget) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? `Failed (${res.status})`);
      router.push(`/admin/lessons/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>Add a lesson</h2>
      <p className="muted small">
        Give a PDF, Word (.docx) or text file that explains a phone task, or describe it below. The app reads it, plans the
        teacher&apos;s demonstration, and writes it in Telugu, Hindi and English. You preview it before learners see it.
      </p>
      <label className="field">
        <span>File (PDF, DOCX, TXT, MD; up to 10 MB)</span>
        <input className="input" type="file" name="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown" disabled={busy} />
      </label>
      <label className="field">
        <span>Or describe the lesson</span>
        <textarea
          className="input"
          name="text"
          rows={4}
          disabled={busy}
          placeholder="e.g. How to make a WhatsApp video call to your son, and how to end it."
        />
      </label>
      <label className="field">
        <span>Title (optional)</span>
        <input className="input" type="text" name="title" maxLength={120} disabled={busy} />
      </label>
      {error && <p className="err">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? `Reading and preparing… ${seconds}s` : "Prepare lesson"}
      </button>
      {busy && <p className="muted small">This usually takes under a minute.</p>}
    </form>
  );
}
