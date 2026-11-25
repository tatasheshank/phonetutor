"use client";

import type { AvatarState } from "@ai-tutor/shared";
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Shoulder position in the SVG's 200x200 viewBox; the pointing arm pivots here. */
const SHOULDER = { x: 160, y: 172 };

const GOLD = "#d4a017";

/** The two drawn teachers: an Indian woman in a saree, and an Indian man in a kurta. */
export type DrawnTeacher = "woman" | "man";

const STYLE: Record<
  DrawnTeacher,
  { skin: string; skinLight: string; shade: string; hair: string; sleeve: string; lipTop: string; lipBottom: string; mouth: string }
> = {
  woman: {
    skin: "#d9a07a",
    skinLight: "#e6b18c",
    shade: "#c08a66",
    hair: "#2a1a13",
    sleeve: "#8f1d3a",
    lipTop: "#a84452",
    lipBottom: "#bd5a65",
    mouth: "#4c1219",
  },
  man: {
    skin: "#c98f68",
    skinLight: "#d9a27c",
    shade: "#ad7552",
    hair: "#1f1712",
    sleeve: "#efe3c8",
    lipTop: "#8e5249",
    lipBottom: "#a2625a",
    mouth: "#3d1512",
  },
};

/**
 * The teacher, drawn (light and quick on cheap phones). Two people to choose from: an Indian woman
 * in a saree, or an Indian man in a kurta. Or, with look="photo", a real photo the admin uploaded.
 *  - Lips move with the tutor's voice: `level` is read every frame outside React for smooth 60 fps.
 *  - Blinks now and then; looks up while thinking; tilts the head slightly while listening.
 *  - With `pointAt` (screen coordinates) raises an arm with a pointer stick aimed at that spot,
 *    like a teacher at a board.
 */
export function Avatar({
  state,
  level,
  pointAt = null,
  look = "drawing",
  photoUrl = null,
}: {
  state: AvatarState;
  level: { current: number };
  pointAt?: { x: number; y: number } | null;
  /** "drawing": the woman; "man": the man; "photo": a real photo uploaded by the admin (glows while speaking). */
  look?: "drawing" | "man" | "photo";
  photoUrl?: string | null;
}) {
  const usePhoto = look === "photo" && !!photoUrl;
  const person: DrawnTeacher = look === "man" ? "man" : "woman";
  const c = STYLE[person];
  const photoGroup = useRef<SVGGElement>(null);
  const glow = useRef<SVGCircleElement>(null);
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
      // Photo: a slight lift and a soft glow with each word (moving lips on a photo look unnatural).
      photoGroup.current?.setAttribute("transform", `translate(100 100) scale(${(1 + open * 0.035).toFixed(4)}) translate(-100 -100)`);
      glow.current?.setAttribute("stroke-opacity", (open * 0.85).toFixed(3));
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
          <stop offset="0%" stopColor={c.skinLight} />
          <stop offset="100%" stopColor={c.skin} />
        </radialGradient>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={person === "man" ? "#e9f1f4" : "#fdf1e3"} />
          <stop offset="100%" stopColor={person === "man" ? "#cfe0e6" : "#f6dcc2"} />
        </linearGradient>
      </defs>

      <circle cx="100" cy="100" r="97" fill="none" stroke={ring} strokeWidth="5" />

      {usePhoto ? (
        <>
          {/* Glow while speaking */}
          <circle ref={glow} cx="100" cy="100" r="95" fill="none" stroke="#f59e0b" strokeWidth="7" strokeOpacity="0" />
          <g clipPath={`url(#frame-${id})`}>
            <g ref={photoGroup}>
              <image href={photoUrl!} x="8" y="8" width="184" height="184" preserveAspectRatio="xMidYMid slice" />
            </g>
          </g>
        </>
      ) : (
        <g clipPath={`url(#frame-${id})`}>
          <circle cx="100" cy="100" r="92" fill={`url(#bg-${id})`} />
          <g transform={tilt} style={{ transition: "transform 300ms ease" }}>
            {person === "man" ? <ManBody faceFill={`url(#face-${id})`} /> : <WomanBody faceFill={`url(#face-${id})`} />}
            <Face person={person} state={state} innerMouth={innerMouth} lowerLip={lowerLip} />
          </g>
        </g>
      )}

      {angle !== null && (
        <g className="avatar-arm" transform={`rotate(${angle.toFixed(1)} ${SHOULDER.x} ${SHOULDER.y})`}>
          {/* Sleeve and hand */}
          <line x1={SHOULDER.x} y1={SHOULDER.y} x2={SHOULDER.x + 44} y2={SHOULDER.y} stroke={c.sleeve} strokeWidth="15" strokeLinecap="round" />
          {person === "man" && (
            <line x1={SHOULDER.x} y1={SHOULDER.y} x2={SHOULDER.x + 44} y2={SHOULDER.y} stroke="#d9cba9" strokeWidth="15" strokeLinecap="round" strokeOpacity="0.35" strokeDasharray="0 7 30 100" />
          )}
          <line x1={SHOULDER.x + 30} y1={SHOULDER.y} x2={SHOULDER.x + 46} y2={SHOULDER.y} stroke={c.skin} strokeWidth="11" strokeLinecap="round" />
          <circle cx={SHOULDER.x + 51} cy={SHOULDER.y} r="8.5" fill={c.skin} />
          {person === "woman" ? (
            // Bangles
            <line x1={SHOULDER.x + 40} y1={SHOULDER.y - 6} x2={SHOULDER.x + 40} y2={SHOULDER.y + 6} stroke={GOLD} strokeWidth="2.5" />
          ) : (
            // Watch
            <rect x={SHOULDER.x + 37} y={SHOULDER.y - 6.5} width="5" height="13" rx="1.5" fill="#374151" />
          )}
          {/* Pointer stick */}
          <line x1={SHOULDER.x + 54} y1={SHOULDER.y} x2={SHOULDER.x + 150} y2={SHOULDER.y} stroke="#92400e" strokeWidth="5" strokeLinecap="round" />
          <circle cx={SHOULDER.x + 150} cy={SHOULDER.y} r="5" fill="#fbbf24" />
        </g>
      )}
    </svg>
  );
}

/** The woman: hair, neck, blouse, saree pallu, jewellery, ears and face shape. */
function WomanBody({ faceFill }: { faceFill: string }) {
  const c = STYLE.woman;
  return (
    <>
      {/* Hair behind the head and shoulders */}
      <path d="M44 96 C38 50 66 22 100 22 C134 22 162 50 156 96 C158 124 152 146 146 160 L54 160 C48 146 42 124 44 96Z" fill={c.hair} />

      {/* Neck, with a soft shadow under the chin */}
      <path d="M86 128 L114 128 L116 162 L84 162Z" fill={c.shade} />
      <path d="M86 132 Q100 142 114 132 L114 128 L86 128Z" fill="#a8714f" opacity="0.5" />

      {/* Blouse and shoulders */}
      <path d="M22 210 C26 176 58 158 100 158 C142 158 174 176 178 210Z" fill={c.sleeve} />
      <path d="M80 158 Q100 182 120 158Z" fill={c.shade} />
      {/* Saree pallu over the left shoulder, with a gold border and a few motifs */}
      <path d="M40 172 C64 160 88 160 104 168 L156 210 L118 210 L70 180 C60 176 50 176 40 172Z" fill="#0f766e" />
      <path d="M42 174 C66 162 88 162 103 170 L153 210" fill="none" stroke={GOLD} strokeWidth="3" />
      <g fill={GOLD} opacity="0.85">
        <circle cx="78" cy="181" r="1.6" />
        <circle cx="96" cy="190" r="1.6" />
        <circle cx="114" cy="200" r="1.6" />
      </g>
      {/* Necklace */}
      <path d="M84 160 Q100 176 116 160" fill="none" stroke={GOLD} strokeWidth="1.6" />
      <circle cx="100" cy="169" r="2.2" fill={GOLD} />

      {/* Ears with jhumka earrings */}
      <ellipse cx="55" cy="92" rx="7" ry="11" fill={c.shade} />
      <ellipse cx="145" cy="92" rx="7" ry="11" fill={c.shade} />
      <g fill={GOLD}>
        <circle cx="55" cy="104" r="2.2" />
        <path d="M50.5 107 Q55 103 59.5 107 L58 112 L52 112Z" />
        <circle cx="145" cy="104" r="2.2" />
        <path d="M140.5 107 Q145 103 149.5 107 L148 112 L142 112Z" />
      </g>

      {/* Face */}
      <path d="M100 40 C128 40 146 60 146 88 C146 116 128 140 100 144 C72 140 54 116 54 88 C54 60 72 40 100 40Z" fill={faceFill} />

      {/* Hair over the forehead, parted in the middle */}
      <path d="M54 88 C52 56 72 36 100 36 C128 36 148 56 146 88 C141 66 126 52 103 50 L100 45 L97 50 C74 52 59 66 54 88Z" fill={c.hair} />

      {/* Bindi */}
      <circle cx="100" cy="62" r="2.6" fill="#b91c1c" />
    </>
  );
}

/** The man: short hair greying at the temples, ears, face shape, kurta with a mandarin collar. */
function ManBody({ faceFill }: { faceFill: string }) {
  const c = STYLE.man;
  return (
    <>
      {/* Neck, with a soft shadow under the chin */}
      <path d="M84 126 L116 126 L119 164 L81 164Z" fill={c.shade} />
      <path d="M84 131 Q100 142 116 131 L116 126 L84 126Z" fill="#8f5d3f" opacity="0.5" />

      {/* Kurta: shoulders, mandarin collar, button placket */}
      <path d="M18 212 C22 174 58 156 100 156 C142 156 178 174 182 212Z" fill={c.sleeve} />
      <path d="M18 212 C22 174 58 156 100 156 C142 156 178 174 182 212Z" fill="none" stroke="#d9cba9" strokeWidth="1.5" />
      <path d="M82 158 Q100 168 118 158 L118 152 Q100 161 82 152Z" fill="#e4d6b6" stroke="#cbbb96" strokeWidth="1" />
      <path d="M100 165 L100 200" stroke="#cbbb96" strokeWidth="1.4" />
      <g fill="#8a6a3a">
        <circle cx="100" cy="172" r="1.8" />
        <circle cx="100" cy="182" r="1.8" />
        <circle cx="100" cy="192" r="1.8" />
      </g>

      {/* Ears */}
      <ellipse cx="53" cy="92" rx="7.5" ry="11.5" fill={c.shade} />
      <ellipse cx="147" cy="92" rx="7.5" ry="11.5" fill={c.shade} />

      {/* Face: a little broader at the jaw */}
      <path d="M100 40 C130 40 148 60 148 88 C148 118 131 142 100 146 C69 142 52 118 52 88 C52 60 70 40 100 40Z" fill={faceFill} />

      {/* Short hair with a side parting, grey at the temples */}
      <path d="M52 86 C48 50 72 30 102 30 C132 30 152 50 148 86 C146 72 140 62 132 56 C118 50 96 50 84 52 L80 46 C70 52 58 64 52 86Z" fill={c.hair} />
      <path d="M80 46 C86 40 96 38 104 38" fill="none" stroke="#3a2c22" strokeWidth="1.4" />
      <path d="M52 86 C51 80 52 74 54 70 L58 72 C56 76 55 82 55 88Z" fill="#9ca3af" />
      <path d="M148 86 C149 80 148 74 146 70 L142 72 C144 76 145 82 145 88Z" fill="#9ca3af" />
    </>
  );
}

/** Eyes, eyebrows, nose, cheeks, mouth (shared, with small differences per person). */
function Face({
  person,
  state,
  innerMouth,
  lowerLip,
}: {
  person: DrawnTeacher;
  state: AvatarState;
  innerMouth: RefObject<SVGEllipseElement | null>;
  lowerLip: RefObject<SVGPathElement | null>;
}) {
  const c = STYLE[person];
  const man = person === "man";
  // Eyes look up and aside while thinking.
  const gaze = state === "thinking" ? "translate(1.6 -1.8)" : "";
  // A friendlier curve to the lips when smiling or listening.
  const smile = state === "smile" || state === "listening";
  const browUp = state === "thinking";

  return (
    <>
      {/* Eyebrows (a little thicker for him) */}
      <g stroke={c.hair} strokeWidth={man ? 3.4 : 2.6} strokeLinecap="round" fill="none">
        <path d={browUp ? "M71 67 Q80 61 89 66" : man ? "M70 69 Q80 65 90 68" : "M71 70 Q80 65 89 69"} />
        <path d={browUp ? "M111 66 Q120 61 129 67" : man ? "M110 68 Q120 65 130 69" : "M111 69 Q120 65 129 70"} />
      </g>

      {/* Eyes */}
      {[80, 120].map((cx) => (
        <g key={cx}>
          <path d={`M${cx - 10} 82 Q${cx} 74 ${cx + 10} 82 Q${cx} 88 ${cx - 10} 82Z`} fill="#fff" />
          <g transform={gaze}>
            <circle cx={cx} cy="81.6" r="4.3" fill="#3f2616" />
            <circle cx={cx} cy="81.6" r="2" fill="#111" />
            <circle cx={cx + 1.4} cy="80.2" r="1" fill="#fff" />
          </g>
          <path d={`M${cx - 10.5} 81.6 Q${cx} 73 ${cx + 10.5} 81.6`} fill="none" stroke={c.hair} strokeWidth={man ? 1.5 : 1.8} strokeLinecap="round" />
          {/* Eyelid for blinking */}
          <path className="av-lid" d={`M${cx - 11} 81.6 Q${cx} 72.6 ${cx + 11} 81.6 L${cx + 11} 89 L${cx - 11} 89Z`} fill={c.skin} />
        </g>
      ))}

      {/* His thin reading glasses */}
      {man && (
        <g fill="none" stroke="#5b4636" strokeWidth="1.6" opacity="0.9">
          <rect x="66" y="73" width="28" height="18" rx="6" />
          <rect x="106" y="73" width="28" height="18" rx="6" />
          <path d="M94 80 Q100 77 106 80" />
          <path d="M66 79 L54 77" />
          <path d="M134 79 L146 77" />
        </g>
      )}

      {/* Nose */}
      <path d={man ? "M99.5 89 Q97.5 99 96 103" : "M99.5 90 Q98 98 96.5 101.5"} fill="none" stroke={c.shade} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <path d={man ? "M94.5 104.5 Q100 107.5 105.5 104.5" : "M95.5 103.5 Q100 106 104.5 103.5"} fill="none" stroke={c.shade} strokeWidth="1.6" strokeLinecap="round" />

      {/* Cheeks */}
      <ellipse cx="74" cy="104" rx="8" ry="4" fill="#e3806e" opacity={man ? 0.15 : 0.3} />
      <ellipse cx="126" cy="104" rx="8" ry="4" fill="#e3806e" opacity={man ? 0.15 : 0.3} />

      {/* Mouth: inner mouth opens, lower lip drops, with the voice */}
      <ellipse ref={innerMouth} cx="100" cy="120.5" rx="8.5" ry="0.6" fill={c.mouth} />
      <path d={smile ? "M87 118.5 Q94 116.5 100 118 Q106 116.5 113 118.5 Q100 121.5 87 118.5Z" : "M88 119 Q94 116.6 100 118.2 Q106 116.6 112 119 Q100 121 88 119Z"} fill={c.lipTop} />
      <path ref={lowerLip} d={smile ? "M88 119.5 Q100 129 112 119.5 Q100 124 88 119.5Z" : "M89 120 Q100 127 111 120 Q100 123.5 89 120Z"} fill={c.lipBottom} />

      {/* His moustache (over the upper lip, so it moves with the mouth's top edge only) */}
      {man && <path d="M84 116 Q92 109 100 112.5 Q108 109 116 116 Q108 114.5 100 116.5 Q92 114.5 84 116Z" fill={c.hair} />}
    </>
  );
}
