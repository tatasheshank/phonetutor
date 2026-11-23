"use client";

import type { AvatarState } from "@ai-tutor/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Shoulder position in the SVG's 200x200 viewBox; the pointing arm pivots here. */
const SHOULDER = { x: 168, y: 168 };

/**
 * Placeholder tutor face until the Rive character exists.
 * The mouth opens with the tutor's audio level (updated outside React for smooth 60fps).
 * With `pointAt` (screen coordinates), she raises an arm with a pointer stick aimed at that spot,
 * like a teacher at a board.
 */
export function Avatar({
  state,
  level,
  pointAt = null,
}: {
  state: AvatarState;
  level: { current: number };
  pointAt?: { x: number; y: number } | null;
}) {
  const mouth = useRef<SVGEllipseElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [angle, setAngle] = useState<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const open = state === "speaking" ? 2 + level.current * 22 : 2;
      mouth.current?.setAttribute("ry", open.toFixed(1));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [state, level]);

  // Angle from the shoulder (on screen) to the target, in degrees (0 = pointing right, -90 = up).
  useLayoutEffect(() => {
    if (!pointAt) {
      setAngle(null);
      return;
    }
    const update = () => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const sx = r.left + (SHOULDER.x / 200) * r.width;
      const sy = r.top + (SHOULDER.y / 200) * r.height;
      setAngle((Math.atan2(pointAt.y - sy, pointAt.x - sx) * 180) / Math.PI);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [pointAt]);

  const ring =
    state === "listening" ? "var(--primary)" : state === "thinking" ? "var(--accent)" : "transparent";

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      width="200"
      height="200"
      style={{ margin: "0 auto", display: "block", overflow: "visible" }}
      aria-hidden
    >
      <circle cx="100" cy="100" r="96" fill="none" stroke={ring} strokeWidth="6" />
      <circle cx="100" cy="100" r="84" fill="#f4c7a1" />
      <path d="M30 90 Q40 20 100 22 Q160 20 170 90 Q150 50 100 52 Q50 50 30 90Z" fill="#3f2a1d" />
      <circle cx="72" cy="98" r="8" fill="#1c1917" />
      <circle cx="128" cy="98" r="8" fill="#1c1917" />
      {state === "thinking" && <circle cx="132" cy="94" r="3" fill="#fff" />}
      <circle cx="100" cy="66" r="5" fill="#b91c1c" />
      <ellipse ref={mouth} cx="100" cy="142" rx="20" ry="2" fill="#7f1d1d" />
      {angle !== null && (
        <g className="avatar-arm" transform={`rotate(${angle.toFixed(1)} ${SHOULDER.x} ${SHOULDER.y})`}>
          {/* sleeve and hand */}
          <line x1={SHOULDER.x} y1={SHOULDER.y} x2={SHOULDER.x + 46} y2={SHOULDER.y} stroke="#0f766e" strokeWidth="16" strokeLinecap="round" />
          <circle cx={SHOULDER.x + 50} cy={SHOULDER.y} r="9" fill="#f4c7a1" />
          {/* pointer stick */}
          <line x1={SHOULDER.x + 54} y1={SHOULDER.y} x2={SHOULDER.x + 150} y2={SHOULDER.y} stroke="#92400e" strokeWidth="5" strokeLinecap="round" />
          <circle cx={SHOULDER.x + 150} cy={SHOULDER.y} r="5" fill="#fbbf24" />
        </g>
      )}
    </svg>
  );
}
