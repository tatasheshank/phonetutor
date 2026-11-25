"use client";

import { useState } from "react";

/**
 * Pre-record a published lesson's narration (default voice, normal speed). Always shows the
 * one-time Sarvam cost first; records only after the admin confirms.
 */
export function PrerecordPanel({ lessonId, published }: { lessonId: string; published: boolean }) {
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<{ lines: number; chars: number; costInr: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function call(record: boolean) {
    setBusy(true);
    setStatus(record ? "Recording… this can take a minute or two." : "Working out the cost…");
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}/prerecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ record }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        lines?: number;
        chars?: number;
        costInr?: number;
        recorded?: number;
        failed?: number;
      };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      if (record) {
        setEstimate(null);
        setStatus(`Recorded ${data.recorded} line(s)${data.failed ? `, ${data.failed} failed (they'll record on first use)` : ""}. Cost about ₹${(data.costInr ?? 0).toFixed(2)}.`);
      } else {
        setEstimate({ lines: data.lines ?? 0, chars: data.chars ?? 0, costInr: data.costInr ?? 0 });
        setStatus(data.lines ? null : "Everything is already recorded. Nothing to pay.");
      }
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Pre-record narration</h2>
      <p className="muted small">
        Saves the teacher&apos;s lines as audio once (default voice, normal speed), so learners hear them instantly and you don&apos;t pay for them
        again. Optional: lines that aren&apos;t pre-recorded record themselves the first time a learner hears them.
      </p>
      {!published ? (
        <p className="small muted">Publish the lesson first.</p>
      ) : estimate && estimate.lines > 0 ? (
        <div className="stack">
          <p>
            <strong>
              {estimate.lines} line(s), {estimate.chars.toLocaleString("en-IN")} characters: about ₹{estimate.costInr.toFixed(2)}
            </strong>{" "}
            (one time, Sarvam).
          </p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => void call(true)}>
              Record now (₹{estimate.costInr.toFixed(2)})
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => setEstimate(null)}>
              Not now
            </button>
          </div>
        </div>
      ) : (
        <button className="btn secondary" disabled={busy} onClick={() => void call(false)}>
          See the cost first
        </button>
      )}
      {status && <p className="small">{status}</p>}
    </section>
  );
}
