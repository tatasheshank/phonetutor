"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  from: "admin" | "assistant";
  text: string;
  at: string;
  tone?: "info" | "warn" | "done" | "error" | "question";
}

interface Job {
  id: string;
  status: "working" | "done" | "failed" | "question";
  messages: Message[];
  chapter?: string;
  seriesId?: string;
  lessons: Array<{ id: string; title: string; videos: number; pictures: number }>;
  costInr: number;
}

const EXAMPLES = [
  "Add AP Board Class 10 Biology, chapter Life Processes, with videos and pictures",
  "Make a course on the Indian Constitution for B.Ed students: features, Fundamental Rights and Duties, Directive Principles",
  "Teach Class 8 Science: Crop production and management",
];

/**
 * The Lesson Assistant: the admin says what to teach (and can attach a document); the assistant
 * makes the course as drafts and reports each step here. Progress is polled every 2 seconds.
 */
export function AssistantChat({ youtubeKey }: { youtubeKey: boolean }) {
  const [message, setMessage] = useState("");
  const [videos, setVideos] = useState(true);
  const [pictures, setPictures] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Resume the last request after a page reload.
  useEffect(() => {
    try {
      const last = localStorage.getItem("assistantJob");
      if (last) void poll(last);
    } catch {
      /* storage may be blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/assistant/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Job;
    setJob(data);
    return data;
  }, []);

  useEffect(() => {
    if (!job || job.status !== "working") return;
    const timer = setTimeout(() => void poll(job.id), 2000);
    return () => clearTimeout(timer);
  }, [job, poll]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [job?.messages.length]);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("message", message.trim());
    const file = fileRef.current?.files?.[0];
    if (file) form.set("file", file);
    if (!videos) form.set("videos", "0");
    if (!pictures) form.set("pictures", "0");
    try {
      const res = await fetch("/api/admin/assistant", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? `Failed (${res.status})`);
      try {
        localStorage.setItem("assistantJob", data.jobId);
      } catch {
        /* ignore */
      }
      setMessage("");
      if (fileRef.current) fileRef.current.value = "";
      await poll(data.jobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const working = job?.status === "working";

  return (
    <div className="stack">
      <section className="card stack assistant-log" aria-live="polite">
        {!job && (
          <div className="stack">
            <p className="muted">
              Tell me what to teach. I&apos;ll write or read the chapter, split it into short lessons in Telugu, Hindi and English, add board slides,
              YouTube videos and free pictures, and leave everything as drafts for you to check and publish.
            </p>
            <div className="stack" style={{ gap: 6 }}>
              {EXAMPLES.map((e) => (
                <button key={e} className="btn secondary" style={{ textAlign: "left" }} onClick={() => setMessage(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {job?.messages.map((m, i) => (
          <div key={i} className={`assistant-msg ${m.from}${m.tone ? ` ${m.tone}` : ""}`}>
            {m.text.split("\n").map((line, j) => (
              <p key={j}>{line}</p>
            ))}
          </div>
        ))}
        {working && <p className="muted small">⏳ Working… you can leave this page; come back to see progress.</p>}
        {job?.chapter && (
          <details>
            <summary className="small">Chapter notes the assistant wrote (check the facts)</summary>
            <pre className="assistant-chapter">{job.chapter}</pre>
          </details>
        )}
        {job?.status === "done" && job.seriesId && (
          <div className="stack" style={{ gap: 6 }}>
            <Link className="btn" href={`/admin/lessons#${job.seriesId}`}>
              Review and publish the course →
            </Link>
            <ul className="small" style={{ margin: 0 }}>
              {job.lessons.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/lessons/${l.id}`}>{l.title}</Link> · {l.videos} video{l.videos === 1 ? "" : "s"} · {l.pictures} picture
                  {l.pictures === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <section className="card stack">
        <label className="stack" style={{ gap: 4 }}>
          <span className="small">What should I make?</span>
          <textarea
            rows={3}
            value={message}
            maxLength={2000}
            placeholder="e.g. Add AP Board Class 10 Biology, Life Processes, with videos and pictures"
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy || working}
          />
        </label>
        <label className="stack small" style={{ gap: 4 }}>
          <span>Your own chapter text (optional: PDF, Word, TXT or MD). Without it, I write the notes myself.</span>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" disabled={busy || working} />
        </label>
        <div className="row small" style={{ gap: 16, display: "flex", flexWrap: "wrap" }}>
          <label>
            <input type="checkbox" checked={videos} onChange={(e) => setVideos(e.target.checked)} /> YouTube videos
          </label>
          <label>
            <input type="checkbox" checked={pictures} onChange={(e) => setPictures(e.target.checked)} /> Pictures
          </label>
        </div>
        {!youtubeKey && videos && (
          <p className="small muted">
            ⚠ Videos need a free YouTube Data API key: create one at console.cloud.google.com (APIs &amp; Services → enable “YouTube Data API v3” →
            Credentials → API key; no billing needed), then add <code>YOUTUBE_API_KEY=…</code> to <code>apps/web/.env.local</code> and restart the web
            app. Until then, courses are made without videos.
          </p>
        )}
        {error && <p className="small error">{error}</p>}
        <button className="btn" onClick={send} disabled={busy || working || !message.trim()}>
          {busy ? "Sending…" : working ? "Working on the last request…" : "Make the course"}
        </button>
        <p className="muted small">
          Uses Sarvam only: about ₹2–10 per course. Everything stays a draft until you publish it. The AI can be wrong and can&apos;t watch videos, so
          review each lesson first.
        </p>
      </section>
    </div>
  );
}
