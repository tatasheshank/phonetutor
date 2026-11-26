import type { Lesson } from "./schema";

/**
 * Pure helpers for the admin's Lesson Assistant (apps/web/lib/assistant): it writes or reads the
 * chapter, splits it into a course, then finds YouTube videos and free pictures for each lesson.
 * Everything here is deterministic so it can be unit-tested; the AI and network calls live in the app.
 */

/** Moves a step so it comes right after `afterId` (a copy). Unknown ids leave the lesson as it is. */
export function placeStepAfter(lesson: Lesson, stepId: string, afterId: string): Lesson {
  const out = structuredClone(lesson);
  const from = out.steps.findIndex((s) => s.id === stepId);
  if (from < 0 || stepId === afterId || !out.steps.some((s) => s.id === afterId)) return out;
  const [step] = out.steps.splice(from, 1);
  const to = out.steps.findIndex((s) => s.id === afterId) + 1;
  out.steps.splice(to, 0, step!);
  return out;
}

/**
 * When each narration cue starts, in seconds. The teacher talks over the opening part of the video
 * (cues ~20 s apart), never past its end. Without a known duration, assume 90 s.
 */
export function cueTimes(count: number, durationSeconds: number | null): number[] {
  const n = Math.max(1, Math.min(count, 8));
  const duration = durationSeconds && durationSeconds > 5 ? durationSeconds : 90;
  const gap = Math.min(22, Math.max(4, (duration - 2) / n));
  return Array.from({ length: n }, (_, i) => Math.round(i * gap));
}

/** "PT4M13S" → 253 (YouTube's ISO 8601 durations). Null if it can't be read. */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * Licences under which a picture may be shown in the app with a credit line: public domain, CC0,
 * CC BY and CC BY-SA (any version), and the Government Open Data Licence – India.
 * NonCommercial (NC), NoDerivatives (ND), fair use and unknown licences are refused.
 */
export function isFreeLicence(shortName: string | null | undefined): boolean {
  const l = (shortName ?? "").trim().toLowerCase();
  if (!l) return false;
  if (/\b(nc|nd)\b|non-?commercial|no-?deriv|fair use|all rights reserved/.test(l)) return false;
  return /^(public domain|pd\b|cc0|cc[ -]by(-sa)?\b|godl)/.test(l);
}

/** The picture's credit line, e.g. "Jean-Pierre Houël · Public domain · Wikimedia Commons". */
export function pictureCredit(artist: string | null | undefined, licence: string): string {
  const who = (artist ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^unknown author.*$/i, "")
    .replace(/^https?:\/\/\S+\s*/, "")
    .slice(0, 80);
  return [who, licence, "Wikimedia Commons"].filter(Boolean).join(" · ").slice(0, 200);
}

/** A 1-based choice from the AI ("pick": 2), checked against the number of options. 0 or bad = none. */
export function pickedIndex(value: unknown, options: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= options ? n - 1 : null;
}
