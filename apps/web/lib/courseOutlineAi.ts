import "server-only";
import { courseOutlineSchema, numberParagraphs, repairOutline, type PlannedCourseLesson } from "@ai-tutor/shared";
import type { ClipInfo } from "./lessonGenerator";
import { parseJsonObject, sarvamChat, SarvamError, type ChatMessage } from "./sarvamChat";

/**
 * Course splitter, step 1: ask Sarvam where each lesson starts and which clips belong to it.
 * The plan is then repaired by repairOutline (shared), so every paragraph and clip is used once, in order.
 */

type Usage = { promptTokens: number; completionTokens: number };

const OUTLINE_SYSTEM = (kind: "phone" | "video", clips: ClipInfo[], paragraphs: number) => {
  const clipRules = clips.length
    ? [
        "- Clips, in teaching order (use each exactly once; a lesson may have several):",
        ...clips.map((c, i) => `  ${i + 1}. "${c.name}"${c.duration ? ` (${c.duration.toFixed(0)} s)` : ""}`),
        '  Put each clip\'s number in the "clips" list of the lesson it belongs to. Clip numbers only go up from one lesson to the next.',
      ].join("\n")
    : '- There are no clips: use "clips": [].';
  return [
    "You split a document into a short COURSE of lessons for older people in India who are new to technology.",
    `The document's paragraphs are numbered [1] to [${paragraphs}].`,
    kind === "video"
      ? "Each lesson will be taught with the teacher's own screen recordings (clips)."
      : "Each lesson will be a short phone demonstration by a teacher.",
    "",
    "Rules:",
    "- 2 to 12 lessons, in the document's order. Each lesson teaches ONE task or idea and takes 3 to 8 minutes; group small steps together.",
    `- Every paragraph belongs to exactly one lesson: give each lesson a "from" and "to" paragraph number, with no gaps or overlaps, from 1 to ${paragraphs}.`,
    '- "title": a short, friendly lesson title in simple English (at most 8 words), e.g. "Open Excel and make a new sheet".',
    clipRules,
    "",
    "Return JSON only, no other text:",
    '{"course": "course title", "lessons": [{"title": "...", "from": 1, "to": 6, "clips": [1, 2]}]}',
  ].join("\n");
};

/** Asks for JSON; if the model returns broken JSON, asks once more. */
async function askJson(messages: ChatMessage[], track: (u: Usage) => void): Promise<unknown> {
  const opts = { model: "sarvam-105b-conversations", maxTokens: 3000, temperature: 0.1 } as const;
  const first = await sarvamChat(messages, opts);
  track(first.usage);
  try {
    return parseJsonObject(first.content);
  } catch (err) {
    if (!(err instanceof SarvamError)) throw err;
    const second = await sarvamChat(
      [
        ...messages,
        { role: "assistant", content: first.content },
        { role: "user", content: "That was not valid JSON. Reply again with only the corrected JSON object." },
      ],
      { ...opts, temperature: 0 },
    );
    track(second.usage);
    return parseJsonObject(second.content);
  }
}

export interface CourseOutlineResult {
  courseTitle: string;
  lessons: PlannedCourseLesson[];
  warnings: string[];
  usage: Usage;
}

export async function outlineCourse(
  paragraphs: string[],
  clips: ClipInfo[],
  kind: "phone" | "video",
  courseHint?: string,
): Promise<CourseOutlineResult> {
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const track = (u: Usage) => {
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
  };
  const json = await askJson(
    [
      { role: "system", content: OUTLINE_SYSTEM(kind, clips, paragraphs.length) },
      { role: "user", content: `${courseHint ? `Course name wanted: ${courseHint}\n` : ""}Document:\n${numberParagraphs(paragraphs)}` },
    ],
    track,
  );
  const outline = courseOutlineSchema.parse(json);
  const { lessons, warnings } = repairOutline(outline, paragraphs.length, clips.length);
  const courseTitle = (courseHint?.trim() || outline.course?.trim() || lessons[0]?.title || "Course").slice(0, 80);
  return { courseTitle, lessons, warnings, usage };
}
