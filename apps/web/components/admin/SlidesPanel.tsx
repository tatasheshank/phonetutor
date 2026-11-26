"use client";

import type { Slide, SlideImage } from "@ai-tutor/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface TalkStepForPanel {
  id: string;
  index: number;
  text: string;
  slide: Slide | null;
  image: SlideImage | null;
}

/**
 * Board slides and pictures for the teacher's talk steps: what the board shows while she explains.
 * "Make board slides" drafts the key points from her lines (all languages); each step can get a
 * picture (with where it is from). Any change here needs publishing again.
 */
export function SlidesPanel({ lessonId, steps }: { lessonId: string; steps: TalkStepForPanel[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const withSlides = steps.filter((s) => s.slide).length;
  const withPictures = steps.filter((s) => s.image).length;

  async function run(key: string, label: string, call: () => Promise<Response>, done: (data: Record<string, unknown>) => string) {
    setBusy(key);
    setStatus(label);
    try {
      const res = await call();
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
      setStatus(done(data));
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const makeSlides = () =>
    run(
      "slides",
      "Making the slides in every language… about half a minute.",
      () => fetch(`/api/admin/lessons/${lessonId}/slides`, { method: "POST" }),
      (d) => `Made ${d.count} slides. Check them in the preview above, then publish.`,
    );

  const find = (what: "pictures" | "videos") =>
    run(
      what,
      what === "pictures" ? "Looking for free pictures on Wikimedia Commons… about a minute." : "Looking for YouTube videos… about a minute.",
      () => fetch(`/api/admin/lessons/${lessonId}/find`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ what }) }),
      (d) => {
        const added = Array.isArray(d.added) ? (d.added as string[]) : [];
        const notes = Array.isArray(d.notes) ? (d.notes as string[]) : [];
        const cost = typeof d.costInr === "number" ? ` (₹${d.costInr.toFixed(2)})` : "";
        return (added.length ? `Added: ${added.join("; ")}.` : `No suitable ${what} found.`) + cost + (notes.length ? " " + notes.join(" ") : "");
      },
    );

  function upload(stepId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setStatus("Choose a picture first.");
      return;
    }
    void run(
      stepId,
      "Uploading the picture…",
      () => fetch(`/api/admin/lessons/${lessonId}/slides/${stepId}`, { method: "POST", body: data }),
      () => "Picture added. Publish again for learners to see it.",
    ).then(() => form.reset());
  }

  const remove = (stepId: string) =>
    run(
      stepId,
      "Removing the picture…",
      () => fetch(`/api/admin/lessons/${lessonId}/slides/${stepId}`, { method: "DELETE" }),
      () => "Picture removed.",
    );

  return (
    <section className="card stack">
      <h2>Board slides and pictures</h2>
      <p className="muted small">
        While the teacher explains, the board shows a heading, a few key points and a picture. {withSlides} of {steps.length} talk steps
        have a slide, {withPictures} have a picture. A slide stays on the board until the next one, so not every step needs its own picture.
      </p>
      <div className="row">
        <button className="btn" onClick={makeSlides} disabled={busy !== null}>
          {withSlides ? "↻ Make the slides again" : "✨ Make board slides"}
        </button>
        <button className="btn secondary" onClick={() => find("pictures")} disabled={busy !== null}>
          🖼 Find pictures
        </button>
        <button className="btn secondary" onClick={() => find("videos")} disabled={busy !== null}>
          🎬 Find videos
        </button>
      </div>
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Teacher says (English)</th>
              <th>Slide (English)</th>
              <th>Picture</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.id}>
                <td>{s.index + 1}</td>
                <td className="small step-text">{s.text}</td>
                <td className="small">
                  {s.slide ? (
                    <>
                      <strong>{s.slide.heading}</strong>
                      {s.slide.points.length > 0 && (
                        <ul style={{ margin: "4px 0 0", paddingLeft: "1.1em" }}>
                          {s.slide.points.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="small">
                  {s.image ? (
                    <div className="stack" style={{ gap: 4 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                      <img src={s.image.src} alt="" style={{ maxWidth: 140, maxHeight: 90, objectFit: "contain", borderRadius: 6 }} />
                      {s.image.credit && <span className="muted">{s.image.credit}</span>}
                      <button className="btn secondary" onClick={() => remove(s.id)} disabled={busy !== null}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <form
                      className="stack"
                      style={{ gap: 4 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        upload(s.id, e.currentTarget);
                      }}
                    >
                      <input type="file" name="file" accept="image/png,image/jpeg,image/webp" />
                      <input type="text" name="credit" placeholder="Source (e.g. Wikimedia Commons)" maxLength={200} />
                      <button className="btn secondary" type="submit" disabled={busy !== null}>
                        {busy === s.id ? "Uploading…" : "Add picture"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
