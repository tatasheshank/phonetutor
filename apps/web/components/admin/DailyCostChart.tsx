"use client";

import { useState } from "react";
import { inr } from "../../lib/format";

/**
 * Single-series bar chart of cost per day. One hue (no legend needed: the title names it),
 * 4px rounded tops anchored to the baseline, 2px gaps, hover/focus tooltip on each bar.
 */
export function DailyCostChart({ days }: { days: Array<{ date: string; total: number; sessions: number }> }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const padL = 44;
  const padB = 24;
  const padT = 12;
  const max = Math.max(...days.map((d) => d.total), 0);
  const top = niceMax(max);
  const plotW = W - padL;
  const plotH = H - padB - padT;
  const slot = plotW / days.length;
  const barW = Math.max(4, slot - 2);
  const y = (v: number) => padT + plotH - (top > 0 ? (v / top) * plotH : 0);
  const ticks = top > 0 ? [0, top / 2, top] : [0];
  const shown = active !== null ? days[active] : null;

  return (
    <div className="viz-root" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Estimated cost per day, last 14 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-secondary)">
              {inr(t, 0)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = Math.max(0, padT + plotH - y(d.total));
          return (
            <g
              key={d.date}
              tabIndex={0}
              role="button"
              aria-label={`${d.date}: ${inr(d.total)}, ${d.sessions} session${d.sessions === 1 ? "" : "s"}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              style={{ cursor: "default", outline: "none" }}
            >
              {/* hit target: the whole column, bigger than the bar */}
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={roundedTop(x, padT + plotH - h, barW, h, Math.min(4, h, barW / 2))}
                  fill="var(--series-1)"
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              )}
              {(i === 0 || i === days.length - 1 || i % 7 === 0) && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={padT + plotH} y2={padT + plotH} stroke="var(--axis)" strokeWidth="1" />
      </svg>
      {shown && (
        <div className="viz-tooltip" role="status">
          <strong>{inr(shown.total)}</strong>
          <span>
            {shown.date} · {shown.sessions} session{shown.sessions === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 0;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 10000) * 10000;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
