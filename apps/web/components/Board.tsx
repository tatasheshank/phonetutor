"use client";

import type { AgentEvent } from "@ai-tutor/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Strings } from "../lib/strings";

export type BoardCueEvent = Extract<AgentEvent, { type: "board_cue" }>;

export interface BoardState {
  stepId: string;
  src: string;
  poster?: string;
  cue: BoardCueEvent | null;
}

/**
 * Classroom board: a short lesson video in a chalkboard frame. The video is muted (the tutor narrates).
 * Each cue plays one segment (seek to `at`, play until `until`, pause there), and draws a pulsing circle
 * at `point` or a box at `highlightBox`, in fractions of the video frame. Reports where the marker is on
 * screen so the avatar can point at it.
 */
export function Board({
  board,
  hold,
  t,
  onPointScreen,
}: {
  board: BoardState;
  /** True while the learner is asking something: pause the video. */
  hold: boolean;
  t: Strings;
  onPointScreen: (p: { x: number; y: number } | null) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [paused, setPaused] = useState(true);
  const cue = board.cue;
  // Latest cue and hold for event handlers that outlive a render.
  const cueRef = useRef(cue);
  const holdRef = useRef(hold);
  cueRef.current = cue;
  holdRef.current = hold;

  // Where the video picture actually sits inside the 16:9 frame (object-fit: contain letterboxes it).
  const measure = useCallback(() => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame || !video) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const vw = video.videoWidth || 9;
    const vh = video.videoHeight || 16;
    const scale = Math.min(fw / vw, fh / vh);
    const width = vw * scale;
    const height = vh * scale;
    setBox({ left: (fw - width) / 2, top: (fh - height) / 2, width, height });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Play the cue's segment.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !cue) return;
    if (Math.abs(v.currentTime - cue.at) > 0.3) v.currentTime = cue.at;
    void v.play().catch(() => {});
  }, [cue]);

  // Stop at the end of the segment. "timeupdate" only fires ~4 times a second, so check every
  // animation frame while playing to stop within a frame of `until`.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !cue || cue.until === null || !cue.pause || paused) return;
    const until = cue.until;
    let frame = 0;
    const check = () => {
      if (v.currentTime >= until - 0.04) {
        v.pause();
        return;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [cue, paused]);

  // Browser-recorded WebM (e.g. placeholders) has no duration or seek index, so seeking fails.
  // Asking for a far-off time makes the browser scan the file once and learn its duration.
  function onLoadedMetadata() {
    const v = videoRef.current;
    if (v && !Number.isFinite(v.duration)) {
      const restore = () => {
        v.removeEventListener("durationchange", restore);
        v.currentTime = cueRef.current?.at ?? 0;
        // Jumping to the end stopped playback; carry on with the current segment.
        if (cueRef.current && !holdRef.current) void v.play().catch(() => {});
      };
      v.addEventListener("durationchange", restore);
      v.currentTime = 1e6;
    }
    measure();
  }

  // Pause while the learner asks a question; carry on afterwards if the segment isn't finished.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !cue) return;
    if (hold) v.pause();
    else if (cue.until === null ? !v.ended : v.currentTime < cue.until - 0.1) void v.play().catch(() => {});
  }, [hold, cue]);

  // Tell the avatar where to point (screen coordinates of the marker's centre).
  useLayoutEffect(() => {
    const report = () => {
      const m = markerRef.current;
      if (!m) return onPointScreen(null);
      const r = m.getBoundingClientRect();
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
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = cue?.at ?? 0;
    void v.play().catch(() => {});
  }

  function togglePause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }

  const pct = (n: number) => `${n * 100}%`;
  const hb = cue?.highlightBox;
  const pt = cue?.point ?? (hb ? { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 } : null);

  return (
    <div className="board">
      <div className="board-frame" ref={frameRef}>
        <video
          ref={videoRef}
          className="board-video"
          src={board.src}
          poster={board.poster}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={onLoadedMetadata}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          aria-label={cue?.caption ?? undefined}
        />
        {box && (
          <div className="board-overlay" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} aria-hidden>
            {hb && <div className="board-box" style={{ left: pct(hb.x), top: pct(hb.y), width: pct(hb.w), height: pct(hb.h) }} />}
            {pt && (
              <div
                ref={markerRef}
                className={`board-point${cue?.point ? "" : " invisible"}`}
                style={{ left: pct(pt.x), top: pct(pt.y) }}
              />
            )}
          </div>
        )}
      </div>
      {cue?.caption && <p className="board-caption">{cue.caption}</p>}
      <div className="row">
        <button className="btn secondary" onClick={replay}>
          ↺ {t.replay}
        </button>
        <button className="btn secondary" onClick={togglePause}>
          {paused ? `▶ ${t.play}` : `⏸ ${t.pause}`}
        </button>
      </div>
    </div>
  );
}
