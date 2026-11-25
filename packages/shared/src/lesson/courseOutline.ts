import { z } from "zod";

/**
 * Course splitter: one long document (and optionally a folder of clips) becomes several lessons.
 *
 * The document is cut into numbered paragraphs; the AI only proposes lesson titles, paragraph
 * ranges and which clips belong where. The lesson text itself always comes from the document, and
 * the ranges and clip assignments are repaired here so every paragraph and clip is used once, in order.
 */

export const MAX_COURSE_LESSONS = 12;
const MAX_PARAGRAPHS = 400;

/**
 * Splits a document into paragraphs: blank-line separated blocks, or single lines for documents
 * written one step per line. Headings stay as their own paragraph, which helps the AI see sections.
 */
export function toParagraphs(text: string): string[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  let parts = clean.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  // One big block (e.g. a numbered list without blank lines): fall back to lines.
  if (parts.length < 4) parts = clean.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (parts.length <= MAX_PARAGRAPHS) return parts;
  // Very long documents: merge neighbours so the outline prompt stays small.
  const size = Math.ceil(parts.length / MAX_PARAGRAPHS);
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i += size) merged.push(parts.slice(i, i + size).join(" "));
  return merged;
}

/** "[1] First paragraph\n[2] ..." for the outline prompt (long paragraphs shortened). */
export function numberParagraphs(paragraphs: string[], maxChars = 400): string {
  return paragraphs.map((p, i) => `[${i + 1}] ${p.length > maxChars ? `${p.slice(0, maxChars)}…` : p}`).join("\n");
}

export const courseOutlineSchema = z.object({
  course: z.string().nullish(),
  lessons: z
    .array(
      z.object({
        title: z.string().nullish(),
        from: z.coerce.number().int().nullish().catch(null),
        to: z.coerce.number().int().nullish().catch(null),
        /** 1-based clip numbers shown in this lesson. */
        clips: z.array(z.coerce.number().int()).nullish().catch(null),
      }),
    )
    .default([]),
});
export type CourseOutline = z.infer<typeof courseOutlineSchema>;

export interface PlannedCourseLesson {
  /** 1-based position in the course. */
  part: number;
  title: string;
  /** 1-based, inclusive paragraph range. */
  from: number;
  to: number;
  /** 0-based clip indexes, in order. */
  clips: number[];
}

/**
 * Makes the AI outline safe to use:
 *  - lessons sorted by where they start, ranges made contiguous and covering paragraphs 1..N;
 *  - empty or overlapping lessons merged away, at most MAX_COURSE_LESSONS (extra ones are joined);
 *  - every clip assigned exactly once, and never to an earlier lesson than the clip before it
 *    (clips are numbered in teaching order).
 */
export function repairOutline(
  outline: CourseOutline,
  paragraphCount: number,
  clipCount: number,
): { lessons: PlannedCourseLesson[]; warnings: string[] } {
  const warnings: string[] = [];
  const n = Math.max(1, paragraphCount);
  const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

  // 1. Starting points, sorted and de-duplicated. A missing "from" goes after the previous lesson.
  let raw = outline.lessons.map((l, i) => ({ ...l, i }));
  let lastFrom = 0;
  const starts = raw
    .map((l) => {
      const from = l.from && l.from >= 1 && l.from <= n ? l.from : Math.min(n, lastFrom + 1);
      lastFrom = from;
      return { title: clean(l.title), from, clips: (l.clips ?? []).map((c) => c - 1) };
    })
    .sort((a, b) => a.from - b.from);
  const unique: typeof starts = [];
  for (const s of starts) {
    const prev = unique.at(-1);
    if (prev && prev.from === s.from) {
      prev.clips.push(...s.clips); // two lessons starting at the same paragraph: keep one
      continue;
    }
    unique.push(s);
  }
  if (unique.length === 0) unique.push({ title: "", from: 1, clips: [] });
  unique[0]!.from = 1;
  if (outline.lessons.length !== unique.length && outline.lessons.length > 0) {
    warnings.push(`The outline had overlapping lessons; ${unique.length} were kept.`);
  }

  // 2. Too many lessons: join the shortest neighbours until within the limit.
  while (unique.length > MAX_COURSE_LESSONS) {
    let best = 1;
    let bestLen = Number.POSITIVE_INFINITY;
    for (let k = 1; k < unique.length; k++) {
      const len = (unique[k + 1]?.from ?? n + 1) - unique[k - 1]!.from;
      if (len < bestLen) {
        bestLen = len;
        best = k;
      }
    }
    const [gone] = unique.splice(best, 1);
    unique[best - 1]!.clips.push(...gone!.clips);
  }
  if (outline.lessons.length > MAX_COURSE_LESSONS) {
    warnings.push(`The outline had ${outline.lessons.length} lessons; joined into ${MAX_COURSE_LESSONS}. Split very long documents into several courses.`);
  }

  // 3. Contiguous ranges.
  const lessons: PlannedCourseLesson[] = unique.map((s, k) => ({
    part: k + 1,
    title: s.title || `Part ${k + 1}`,
    from: s.from,
    to: (unique[k + 1]?.from ?? n + 1) - 1,
    clips: [],
  }));

  // 4. Clips: each exactly once, lessons never going backwards along the clip order.
  const wanted = new Map<number, number>(); // clip -> lesson index (first claim wins)
  unique.forEach((s, k) => {
    for (const c of s.clips) if (c >= 0 && c < clipCount && !wanted.has(c)) wanted.set(c, k);
  });
  let lessonOfPrev = 0;
  let moved = 0;
  for (let c = 0; c < clipCount; c++) {
    let k = wanted.get(c);
    if (k === undefined) {
      // Unassigned: same lesson as the clip before it (or the first lesson).
      k = lessonOfPrev;
      moved++;
    } else if (k < lessonOfPrev) {
      k = lessonOfPrev;
      moved++;
    }
    lessons[k]!.clips.push(c);
    lessonOfPrev = k;
  }
  if (moved > 0 && clipCount > 0) warnings.push(`${moved} clip(s) were placed next to their neighbours to keep the clips in order. Check each lesson's videos.`);

  return { lessons, warnings };
}
