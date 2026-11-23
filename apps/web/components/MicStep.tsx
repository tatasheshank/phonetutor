"use client";

import { useEffect, useRef, useState } from "react";
import type { Strings } from "../lib/strings";

/**
 * Explains the mic before Chrome's permission prompt, then shows a level meter.
 * TODO(M2): time the learner's pauses here to set their personal endpointing delay.
 */
export function MicStep({ t, onDone }: { t: Strings; onDone: () => void }) {
  const [state, setState] = useState<"idle" | "listening" | "heard" | "denied">("idle");
  const [level, setLevel] = useState(0);
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => () => cleanup.current(), []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let frame = 0;
      let loudFrames = 0;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 6));
        if (rms > 0.05) loudFrames++;
        if (loudFrames > 15) setState("heard");
        frame = requestAnimationFrame(tick);
      };
      setState("listening");
      tick();

      // Runs on "Next" and again when the step unmounts, so it must be safe to repeat.
      cleanup.current = () => {
        cleanup.current = () => {};
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((tr) => tr.stop());
        if (ctx.state !== "closed") ctx.close().catch(() => {});
      };
    } catch {
      setState("denied");
    }
  }

  return (
    <>
      <h1>{t.micTitle}</h1>
      <p className="muted">{t.micHint}</p>
      {state === "idle" && (
        <button className="btn" onClick={start}>
          🎤 {t.micButton}
        </button>
      )}
      {(state === "listening" || state === "heard") && (
        <div className="meter" role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${level * 100}%` }} />
        </div>
      )}
      {state === "heard" && <p className="status">✅ {t.micHeard}</p>}
      {state === "denied" && <p className="status" style={{ color: "var(--danger)" }}>{t.micDenied}</p>}
      <button
        className="btn"
        disabled={state !== "heard"}
        onClick={() => {
          cleanup.current();
          onDone();
        }}
      >
        {t.next}
      </button>
    </>
  );
}
