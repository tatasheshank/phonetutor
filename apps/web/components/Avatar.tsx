"use client";

import type { AvatarState } from "@ai-tutor/shared";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** Shoulder position in the SVG's 200x200 viewBox; the pointing arm pivots here. */
const SHOULDER = { x: 160, y: 172 };

const SKIN = "#d9a07a";
const SKIN_SHADE = "#c08a66";
const HAIR = "#2a1a13";
const BLOUSE = "#8f1d3a";
const SAREE = "#0f766e";
const GOLD = "#d4a017";

/**
 * The teacher: an illustrated Indian woman in a saree (a lightweight drawing, quick on cheap phones).
 *  - Her lips move with the tutor's voice: `level` is read every frame outside React for smooth 60 fps.
 *  - She blinks now and then; looks up while thinking; tilts her head slightly while listening.
 *  - With `pointAt` (screen coordinates) she raises her arm with a pointer stick aimed at that spot,
 *    like a teacher at a board.
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
  const id = useId().replace(/:/g, "");
  const innerMouth = useRef<SVGEllipseElement>(null);
  const lowerLip = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [angle, setAngle] = useState<number | null>(null);

  // Lip-sync: open the mouth with the voice level, smoothed so it doesn't flicker.
  useEffect(() => {
    let frame = 0;
    let open = 0;
    const tick = () => {
      const target = state === "speaking" ? Math.min(1, level.current * 1.6) : 0;
      open += (target - open) * 0.45;
      innerMouth.current?.setAttribute("ry", (0.6 + open * 6.5).toFixed(2));
      lowerLip.current?.setAttribute("transform", `translate(0 ${(open * 5.5).toFixed(2)})`);
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

  const ring = state === "listening" ? "var(--primary)" : state === "thinking" ? "var(--accent)" : "transparent";
  // Eyes look up and aside while thinking.
  const look = state === "thinking" ? "translate(1.6 -1.8)" : "";
  // A friendlier curve to the lips when smiling or listening.
  const smile = state === "smile" || state === "listening";
  const tilt = state === "listening" ? "rotate(-3 100 150)" : "";

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      width="200"
      height="200"
      className="avatar"
      style={{ margin: "0 auto", display: "block", overflow: "visible" }}
      aria-hidden
    >
      <defs>
        <clipPath id={`frame-${id}`}>
          <circle cx="100" cy="100" r="92" />
        </clipPath>
        <radialGradient id={`face-${id}`} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#e6b18c" />
          <stop offset="100%" stopColor={SKIN} />
        </radialGradient>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdf1e3" />
          <stop offset="100%" stopColor="#f6dcc2" />
        </linearGradient>
      </defs>

      <circle cx="100" cy="100" r="97" fill="none" stroke={ring} strokeWidth="5" />

      <g clipPath={`url(#frame-${id})`}>
        <circle cx="100" cy="100" r="92" fill={`url(#bg-${id})`} />

        <g transform={tilt} style={{ transition: "transform 300ms ease" }}>
          {/* Hair behind the head and shoulders */}
          <path d="M44 96 C38 50 66 22 100 22 C134 22 162 50 156 96 C158 124 152 146 146 160 L54 160 C48 146 42 124 44 96Z" fill={HAIR} />

          {/* Neck */}
          <path d="M86 128 L114 128 L116 162 L84 162Z" fill={SKIN_SHADE} />

          {/* Blouse and shoulders */}
          <path d="M22 210 C26 176 58 158 100 158 C142 158 174 176 178 210Z" fill={BLOUSE} />
          {/* Neckline */}
          <path d="M80 158 Q100 182 120 158Z" fill={SKIN_SHADE} />
          {/* Saree pallu over the left shoulder, with a gold border */}
          <path d="M40 172 C64 160 88 160 104 168 L156 210 L118 210 L70 180 C60 176 50 176 40 172Z" fill={SAREE} />
          <path d="M42 174 C66 162 88 162 103 170 L153 210" fill="none" stroke={GOLD} strokeWidth="3" />
          {/* Necklace */}
          <path d="M84 160 Q100 176 116 160" fill="none" stroke={GOLD} strokeWidth="1.6" />
          <circle cx="100" cy="169" r="2.2" fill={GOLD} />

          {/* Ears with jhumka earrings */}
          <ellipse cx="55" cy="92" rx="7" ry="11" fill={SKIN_SHADE} />
          <ellipse cx="145" cy="92" rx="7" ry="11" fill={SKIN_SHADE} />
          <g fill={GOLD}>
            <circle cx="55" cy="104" r="2.2" />
            <path d="M50.5 107 Q55 103 59.5 107 L58 112 L52 112Z" />
            <circle cx="145" cy="104" r="2.2" />
            <path d="M140.5 107 Q145 103 149.5 107 L148 112 L142 112Z" />
          </g>

          {/* Face */}
          <path d="M100 40 C128 40 146 60 146 88 C146 116 128 140 100 144 C72 140 54 116 54 88 C54 60 72 40 100 40Z" fill={`url(#face-${id})`} />

          {/* Hair over the forehead, parted in the middle */}
          <path d="M54 88 C52 56 72 36 100 36 C128 36 148 56 146 88 C141 66 126 52 103 50 L100 45 L97 50 C74 52 59 66 54 88Z" fill={HAIR} />

          {/* Bindi */}
          <circle cx="100" cy="62" r="2.6" fill="#b91c1c" />

          {/* Eyebrows */}
          <g stroke={HAIR} strokeWidth="2.6" strokeLinecap="round" fill="none">
            <path d={state === "thinking" ? "M71 67 Q80 61 89 66" : "M71 70 Q80 65 89 69"} />
            <path d={state === "thinking" ? "M111 66 Q120 61 129 67" : "M111 69 Q120 65 129 70"} />
          </g>

          {/* Eyes */}
          {[80, 120].map((cx) => (
            <g key={cx}>
              <path d={`M${cx - 10} 82 Q${cx} 74 ${cx + 10} 82 Q${cx} 88 ${cx - 10} 82Z`} fill="#fff" />
              <g transform={look}>
                <circle cx={cx} cy="81.6" r="4.3" fill="#4a2c1a" />
                <circle cx={cx} cy="81.6" r="2" fill="#111" />
                <circle cx={cx + 1.4} cy="80.2" r="1" fill="#fff" />
              </g>
              <path d={`M${cx - 10.5} 81.6 Q${cx} 73 ${cx + 10.5} 81.6`} fill="none" stroke={HAIR} strokeWidth="1.8" strokeLinecap="round" />
              {/* Eyelid for blinking */}
              <path className="av-lid" d={`M${cx - 11} 81.6 Q${cx} 72.6 ${cx + 11} 81.6 L${cx + 11} 89 L${cx - 11} 89Z`} fill={SKIN} />
            </g>
          ))}

          {/* Nose */}
          <path d="M99.5 90 Q98 98 96.5 101.5" fill="none" stroke={SKIN_SHADE} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <path d="M95.5 103.5 Q100 106 104.5 103.5" fill="none" stroke={SKIN_SHADE} strokeWidth="1.6" strokeLinecap="round" />

          {/* Cheeks */}
          <ellipse cx="74" cy="104" rx="8" ry="4" fill="#e3806e" opacity="0.3" />
          <ellipse cx="126" cy="104" rx="8" ry="4" fill="#e3806e" opacity="0.3" />

          {/* Mouth: inner mouth opens, lower lip drops, with the voice */}
          <ellipse ref={innerMouth} cx="100" cy="120.5" rx="8.5" ry="0.6" fill="#4c1219" />
          <path d={smile ? "M87 118.5 Q94 116.5 100 118 Q106 116.5 113 118.5 Q100 121.5 87 118.5Z" : "M88 119 Q94 116.6 100 118.2 Q106 116.6 112 119 Q100 121 88 119Z"} fill="#a84452" />
          <path ref={lowerLip} d={smile ? "M88 119.5 Q100 129 112 119.5 Q100 124 88 119.5Z" : "M89 120 Q100 127 111 120 Q100 123.5 89 120Z"} fill="#bd5a65" />
        </g>
      </g>

      {angle !== null && (
        <g className="avatar-arm" transform={`rotate(${angle.toFixed(1)} ${SHOULDER.x} ${SHOULDER.y})`}>
          {/* Sleeve and hand */}
          <line x1={SHOULDER.x} y1={SHOULDER.y} x2={SHOULDER.x + 44} y2={SHOULDER.y} stroke={BLOUSE} strokeWidth="15" strokeLinecap="round" />
          <line x1={SHOULDER.x + 30} y1={SHOULDER.y} x2={SHOULDER.x + 46} y2={SHOULDER.y} stroke={SKIN} strokeWidth="11" strokeLinecap="round" />
          <circle cx={SHOULDER.x + 51} cy={SHOULDER.y} r="8.5" fill={SKIN} />
          {/* Bangles */}
          <line x1={SHOULDER.x + 40} y1={SHOULDER.y - 6} x2={SHOULDER.x + 40} y2={SHOULDER.y + 6} stroke={GOLD} strokeWidth="2.5" />
          {/* Pointer stick */}
          <line x1={SHOULDER.x + 54} y1={SHOULDER.y} x2={SHOULDER.x + 150} y2={SHOULDER.y} stroke="#92400e" strokeWidth="5" strokeLinecap="round" />
          <circle cx={SHOULDER.x + 150} cy={SHOULDER.y} r="5" fill="#fbbf24" />
        </g>
      )}
    </svg>
  );
}
