"use client";

import type { LanguageCode } from "@ai-tutor/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { uploadClip } from "./uploadClip";

/**
 * Cue editor for one board video. The admin plays the clip, pauses where something happens, and
 * for each cue sets: the time, where the teacher points (tap the frame) or a box (drag on the frame),
 * and what she says in each language. "Draft Telugu & Hindi" asks Sarvam for translations of the
 * English lines, to edit before publishing.
 */

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type PerLang = Partial<Record<LanguageCode, string>>;

export interface EditorCue {
  at: number;
  pause: boolean;
  point?: Point;
  highlightBox?: Box;
  text: PerLang;
}

export interface VideoStepForEditor {
  id: string;
  src: string;
  poster?: string;
  label?: string;
  cues: EditorCue[];
  intro: PerLang;
  mediaMissing: boolean;
  /** Changes when the clip is re-uploaded (file time), so the browser doesn't show a cached old clip. */
  mediaVersion?: string;
}

const LANG_LABEL: Record<LanguageCode, string> = { te: "తెలుగు", hi: "हिंदी", en: "English" };

export function VideoCueEditor({
  lessonId,
  step,
  index,
  langs,
  canMoveUp,
  canMoveDown,
}: {
  lessonId: string;
  step: VideoStepForEditor;
  index: number;
  langs: LanguageCode[];
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [cues, setCues] = useState<EditorCue[]>(step.cues);
  const [intro, setIntro] = useState<PerLang>(step.intro);
  const [sel, setSel] = useState(0);
  const [tool, setTool] = useState<"point" | "box">("point");
  const [picture, setPicture] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const stopAt = useRef<number | null>(null);

  const change = (fn: (c: EditorCue[]) => EditorCue[]) => {
    setCues((c) => fn(c));
    setDirty(true);
  };
  const cue = cues[sel];

  // Where the picture sits inside the frame (object-fit: contain letterboxes it).
  const measure = useCallback(() => {
    const f = frameRef.current;
    const v = videoRef.current;
    if (!f || !v || !v.videoWidth) return;
    const scale = Math.min(f.clientWidth / v.videoWidth, f.clientHeight / v.videoHeight);
    const width = v.videoWidth * scale;
    const height = v.videoHeight * scale;
    setPicture({ left: (f.clientWidth - width) / 2, top: (f.clientHeight - height) / 2, width, height });
  }, []);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function frac(e: React.PointerEvent): Point | null {
    if (!picture || !frameRef.current) return null;
    const r = frameRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left - picture.left) / picture.width;
    const y = (e.clientY - r.top - picture.top) / picture.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = frac(e);
    if (!p || !cue) return;
    videoRef.current?.pause();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === "point") {
      change((c) => c.map((x, i) => (i === sel ? { ...x, point: p } : x)));
    } else {
      setDrag({ from: p, to: p });
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = frac(e);
    if (p) setDrag({ ...drag, to: p });
  }
  function onPointerUp() {
    if (!drag) return;
    const box = {
      x: Math.min(drag.from.x, drag.to.x),
      y: Math.min(drag.from.y, drag.to.y),
      w: Math.abs(drag.to.x - drag.from.x),
      h: Math.abs(drag.to.y - drag.from.y),
    };
    setDrag(null);
    if (box.w < 0.01 || box.h < 0.01) return;
    change((c) => c.map((x, i) => (i === sel ? { ...x, highlightBox: box } : x)));
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  function addCue() {
    const at = round1(videoRef.current?.currentTime ?? 0);
    const next: EditorCue = { at, pause: true, text: {} };
    const list = [...cues, next].sort((a, b) => a.at - b.at);
    setCues(list);
    setSel(list.indexOf(next));
    setDirty(true);
  }

  function setTimeHere() {
    const at = round1(videoRef.current?.currentTime ?? 0);
    change((c) => c.map((x, i) => (i === sel ? { ...x, at } : x)));
  }

  function removeCue(i: number) {
    if (cues.length <= 1) return;
    change((c) => c.filter((_, k) => k !== i));
    setSel(0);
  }

  /** Plays the selected cue's segment: from its time to the next cue's. */
  function playCue(i: number) {
    const v = videoRef.current;
    const c = cues[i];
    if (!v || !c) return;
    const sorted = [...cues].sort((a, b) => a.at - b.at);
    const k = sorted.indexOf(c);
    stopAt.current = sorted[k + 1]?.at ?? null;
    v.currentTime = c.at;
    void v.play().catch(() => {});
  }
  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setNow(v.currentTime);
    if (stopAt.current !== null && v.currentTime >= stopAt.current - 0.05) {
      v.pause();
      stopAt.current = null;
    }
  }

  async function draftTranslations() {
    const en = cues.map((c) => c.text.en ?? "");
    if (en.every((t) => !t.trim()) && !intro.en?.trim()) {
      setStatus("Write the English narration first.");
      return;
    }
    const hasOther = cues.some((c) => langs.some((l) => l !== "en" && c.text[l]?.trim()));
    if (hasOther && !confirm("Replace the Telugu and Hindi lines with new drafts from the English?")) return;
    setBusy(true);
    setStatus("Drafting Telugu and Hindi…");
    try {
      const lines = [intro.en ?? "", ...en];
      const others = langs.filter((l) => l !== "en");
      const results = await Promise.all(
        others.map(async (lang) => {
          const res = await fetch("/api/admin/translate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lines, lang }),
          });
          const data = (await res.json()) as { lines?: string[]; error?: string };
          if (!res.ok || !data.lines) throw new Error(data.error ?? "Translation failed");
          return [lang, data.lines] as const;
        }),
      );
      setIntro((v) => ({ ...v, ...Object.fromEntries(results.map(([l, out]) => [l, lines[0] ? out[0] : ""])) }));
      change((c) => c.map((x, i) => ({ ...x, text: { ...x.text, ...Object.fromEntries(results.map(([l, out]) => [l, out[i + 1] ?? ""])) } })));
      setStatus("Drafted. Read them, fix anything odd, then Save.");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setStatus("Saving…");
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}/steps/${step.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cues, intro }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setDirty(false);
      setStatus("Saved.");
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stepAction(method: "PATCH" | "DELETE", body?: unknown) {
    if (method === "DELETE" && !confirm(`Remove this video step (${step.label ?? step.id}) from the lesson?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}/steps/${step.id}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function replace(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadClip(lessonId, file, { stepId: step.id }, (p) => setStatus(`Uploading ${file.name} (${p}%)`));
      setStatus("Uploaded.");
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pct = (n: number) => `${n * 100}%`;
  const dragBox = drag && {
    x: Math.min(drag.from.x, drag.to.x),
    y: Math.min(drag.from.y, drag.to.y),
    w: Math.abs(drag.to.x - drag.from.x),
    h: Math.abs(drag.to.y - drag.from.y),
  };
  const box = dragBox ?? cue?.highlightBox;
  // Cache-bust after a re-upload (same URL, new file).
  const src = step.mediaVersion ? `${step.src}?v=${step.mediaVersion}` : step.src;

  return (
    <section className="card stack cue-editor" id={`step-${step.id}`}>
      <header className="cue-head">
        <h3>
          Step {index + 1}: video {step.label ? <span className="muted small">({step.label})</span> : null}
        </h3>
        <div className="cue-head-actions">
          <button className="link-btn" disabled={busy || !canMoveUp} onClick={() => void stepAction("PATCH", { move: -1 })} aria-label="Move step up">
            ↑
          </button>
          <button className="link-btn" disabled={busy || !canMoveDown} onClick={() => void stepAction("PATCH", { move: 1 })} aria-label="Move step down">
            ↓
          </button>
          <button className="link-danger" disabled={busy} onClick={() => void stepAction("DELETE")}>
            Remove
          </button>
        </div>
      </header>

      {step.mediaMissing ? (
        <p className="err">This clip hasn&apos;t been uploaded yet. Choose it below.</p>
      ) : (
        <div className="cue-stage">
          <div
            className={`cue-frame tool-${tool}`}
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <video
              ref={videoRef}
              src={src}
              poster={step.poster}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={measure}
              onTimeUpdate={onTimeUpdate}
            />
            {picture && (
              <div className="cue-overlay" style={{ left: picture.left, top: picture.top, width: picture.width, height: picture.height }}>
                {box && <div className="board-box" style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }} />}
                {cue?.point && <div className="board-point" style={{ left: pct(cue.point.x), top: pct(cue.point.y) }} />}
              </div>
            )}
          </div>
          <div className="row cue-transport">
            <button className="btn secondary" type="button" onClick={() => void videoRef.current?.play()}>
              ▶ Play
            </button>
            <button className="btn secondary" type="button" onClick={() => videoRef.current?.pause()}>
              ⏸ Pause
            </button>
            <span className="cue-time">{now.toFixed(1)} s</span>
          </div>
          <input
            className="cue-scrub"
            type="range"
            min={0}
            max={videoRef.current?.duration || 60}
            step={0.1}
            value={now}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.currentTarget.value);
            }}
            aria-label="Position in the clip"
          />
          <div className="row cue-tools">
            <span className="small muted">On the picture:</span>
            <button type="button" className={`btn ${tool === "point" ? "" : "secondary"}`} onClick={() => setTool("point")}>
              👉 Tap to point
            </button>
            <button type="button" className={`btn ${tool === "box" ? "" : "secondary"}`} onClick={() => setTool("box")}>
              ▭ Drag a box
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <span className="small">Said before the clip starts (optional)</span>
        {langs.map((l) => (
          <input
            key={l}
            className="input"
            lang={l}
            placeholder={LANG_LABEL[l]}
            value={intro[l] ?? ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setIntro((v) => ({ ...v, [l]: value }));
              setDirty(true);
            }}
          />
        ))}
      </div>

      <ol className="cue-list">
        {cues.map((c, i) => (
          <li key={i} className={`cue-item${i === sel ? " selected" : ""}`} onClick={() => setSel(i)}>
            <div className="cue-row">
              <strong>Cue {i + 1}</strong>
              <label className="small">
                at{" "}
                <input
                  className="input cue-at"
                  type="number"
                  min={0}
                  step={0.1}
                  value={c.at}
                  onChange={(e) => {
                    const at = Number(e.currentTarget.value);
                    change((list) => list.map((x, k) => (k === i ? { ...x, at: Number.isFinite(at) ? at : 0 } : x)));
                  }}
                />{" "}
                s
              </label>
              {i === sel && !step.mediaMissing && (
                <button type="button" className="link-btn" onClick={setTimeHere}>
                  ⏱ use current time
                </button>
              )}
              <button type="button" className="link-btn" onClick={() => playCue(i)} disabled={step.mediaMissing}>
                ▶ play cue
              </button>
              <label className="small">
                <input
                  type="checkbox"
                  checked={c.pause}
                  onChange={(e) => {
                    const pause = e.currentTarget.checked;
                    change((list) => list.map((x, k) => (k === i ? { ...x, pause } : x)));
                  }}
                />{" "}
                pause until she finishes
              </label>
              <span className="small muted">
                {c.point ? "👉 point" : ""} {c.highlightBox ? "▭ box" : ""}
              </span>
              {(c.point || c.highlightBox) && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => change((list) => list.map((x, k) => (k === i ? { at: x.at, pause: x.pause, text: x.text } : x)))}
                >
                  clear marks
                </button>
              )}
              {cues.length > 1 && (
                <button type="button" className="link-danger" onClick={() => removeCue(i)}>
                  delete
                </button>
              )}
            </div>
            {langs.map((l) => (
              <textarea
                key={l}
                className="input"
                lang={l}
                rows={2}
                placeholder={`${LANG_LABEL[l]}: what the teacher says here`}
                value={c.text[l] ?? ""}
                onFocus={() => setSel(i)}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  change((list) => list.map((x, k) => (k === i ? { ...x, text: { ...x.text, [l]: value } } : x)));
                }}
              />
            ))}
          </li>
        ))}
      </ol>

      <div className="row">
        <button type="button" className="btn secondary" onClick={addCue} disabled={busy || step.mediaMissing}>
          + Cue at current time
        </button>
        <button type="button" className="btn secondary" onClick={() => void draftTranslations()} disabled={busy}>
          ✍ Draft Telugu &amp; Hindi from English
        </button>
        <button type="button" className="btn" onClick={() => void save()} disabled={busy || !dirty}>
          {dirty ? "Save" : "Saved"}
        </button>
      </div>
      {status && <p className="small">{status}</p>}

      <details className="small">
        <summary>Replace the clip or add a poster image</summary>
        <label className="field">
          <span>New clip (MP4 or WebM, up to 50 MB)</span>
          <input type="file" accept=".mp4,.webm,video/mp4,video/webm" disabled={busy} onChange={(e) => void replace(e.currentTarget.files?.[0])} />
        </label>
        <label className="field">
          <span>Poster image shown before it plays (PNG, JPG or WebP)</span>
          <input type="file" accept=".png,.jpg,.jpeg,.webp,image/*" disabled={busy} onChange={(e) => void replace(e.currentTarget.files?.[0])} />
        </label>
      </details>
    </section>
  );
}
