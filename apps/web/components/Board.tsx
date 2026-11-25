"use client";

import type { AgentEvent } from "@ai-tutor/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Strings } from "../lib/strings";
import { MediaSurface, type BoardSource, type MediaControl } from "./boardMedia";

export type BoardCueEvent = Extract<AgentEvent, { type: "board_cue" }>;

export interface BoardState {
  stepId: string;
  source: BoardSource;
  cue: BoardCueEvent | null;
}

/**
 * Classroom board: a short lesson video in a chalkboard frame, from an upload or YouTube. It is muted
 * (the tutor narrates). Each cue plays one segment (seek to `at`, play until `until`, pause there),
 * and draws a pulsing circle at `point` or a box at `highlightBox`, in fractions of the picture.
 * Reports where the marker is on screen so the avatar can point at it. Learners can't operate the
 * video itself (a layer above it takes their taps), so they can't wander off to YouTube.
 * If the video can't play, the board says so and the lesson carries on with the narration.
 */
export function Board({
  board,
  hold,
  t,
  onPointScreen,
  onMediaError,
}: {
  board: BoardState;
  /** True while the learner is asking something: pause the video. */
  hold: boolean;
  t: Strings;
  onPointScreen: (p: { x: number; y: number } | null) => void;
  /** Reported once per step, so the admin dashboard can flag broken videos. */
  onMediaError?: (stepId: string, code: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const media = useRef<MediaControl | null>(null);
  const [ready, setReady] = useState(false);
  // Bumped each time the surface (re)reports ready, e.g. after an upload's metadata loads: the
  // current cue is applied again then, in case the earlier seek happened before the video loaded.
  const [readyTick, setReadyTick] = useState(0);
  const [picture, setPicture] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [paused, setPaused] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cue = board.cue;

  // A new video: start over.
  const sourceKey = board.source.kind === "youtube" ? `yt:${board.source.videoId}` : `up:${board.source.src}`;
  useEffect(() => {
    media.current = null;
    setReady(false);
    setError(null);
    setPicture(null);
  }, [sourceKey]);

  // Where the picture actually sits inside the frame (letterboxed to fit).
  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame || !picture) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const scale = Math.min(fw / picture.w, fh / picture.h);
    const width = picture.w * scale;
    const height = picture.h * scale;
    setBox({ left: (fw - width) / 2, top: (fh - height) / 2, width, height });
  }, [picture]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Play the cue's segment once the video is ready.
  useEffect(() => {
    const m = media.current;
    if (!m || !ready || !cue) return;
    if (Math.abs(m.currentTime() - cue.at) > 0.3) m.seek(cue.at);
    // Play even while the learner is mid-question: the hold effect pauses it again. Calling play()
    // is also what makes phone browsers start loading the video at all.
    m.play();
    if (hold) m.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new cue or when the video becomes ready
  }, [cue, ready, readyTick]);

  // Stop at the end of the segment. Checked every animation frame (and on a timer, which keeps
  // running when animation frames are throttled) to stop close to `until`.
  useEffect(() => {
    const m = media.current;
    if (!m || !cue || cue.until === null || !cue.pause || paused) return;
    const until = cue.until;
    let frame = 0;
    const check = () => {
      if (m.currentTime() >= until - 0.04) {
        m.pause();
        return true;
      }
      return false;
    };
    const loop = () => {
      if (!check()) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const timer = setInterval(check, 100);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [cue, paused]);

  // Pause while the learner asks a question; carry on afterwards if the segment isn't finished.
  useEffect(() => {
    const m = media.current;
    if (!m || !ready || !cue) return;
    if (hold) m.pause();
    else if (cue.until === null || m.currentTime() < cue.until - 0.1) m.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to hold only
  }, [hold]);

  // Tell the avatar where to point (screen coordinates of the marker's centre).
  useLayoutEffect(() => {
    const report = () => {
      const mk = markerRef.current;
      if (!mk) return onPointScreen(null);
      const r = mk.getBoundingClientRect();
      onPointScreen({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    report();
    window.addEventListener("resize", report);
    window.addEventListener("scroll", report, true);
    return () => {
      window.removeEventListener("resize", report);
      window.removeEventListener("scroll", report, true);
    };
  }, [box, cue, onPointScreen]);

  useEffect(() => () => onPointScreen(null), [onPointScreen]);

  function replay() {
    const m = media.current;
    if (!m) return;
    m.seek(cue?.at ?? 0);
    m.play();
  }

  function togglePause() {
    const m = media.current;
    if (!m) return;
    if (m.paused()) m.play();
    else m.pause();
  }

  const pct = (n: number) => `${n * 100}%`;
  const hb = cue?.highlightBox;
  const pt = cue?.point ?? (hb ? { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 } : null);

  return (
    <div className="board">
      <div className="board-frame" ref={frameRef}>
        <MediaSurface
          source={board.source}
          label={cue?.caption ?? undefined}
          onReady={(control, size) => {
            media.current = control;
            setPicture(size);
            setReady(true);
            setReadyTick((n) => n + 1);
          }}
          onPlayingChange={(playing) => setPaused(!playing)}
          onError={(code) => {
            setError(code);
            onMediaError?.(board.stepId, code);
          }}
        />
        {/* Takes the learner's taps so they can't operate the video (or open YouTube). */}
        <div className="board-shield" aria-hidden />
        {error ? (
          <div className="board-error" role="status">
            <p>🎬 {t.videoBroken}</p>
            <p>{t.videoUnavailable}</p>
          </div>
        ) : (
          box && (
            <div className="board-overlay" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} aria-hidden>
              {hb && <div className="board-box" style={{ left: pct(hb.x), top: pct(hb.y), width: pct(hb.w), height: pct(hb.h) }} />}
              {pt && (
                <div ref={markerRef} className={`board-point${cue?.point ? "" : " invisible"}`} style={{ left: pct(pt.x), top: pct(pt.y) }} />
              )}
            </div>
          )
        )}
      </div>
      {cue?.caption && <p className="board-caption">{cue.caption}</p>}
      {!error && (
        <div className="row">
          <button className="btn secondary" onClick={replay}>
            ↺ {t.replay}
          </button>
          <button className="btn secondary" onClick={togglePause}>
            {paused ? `▶ ${t.play}` : `⏸ ${t.pause}`}
          </button>
        </div>
      )}
    </div>
  );
}
