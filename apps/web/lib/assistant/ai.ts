import "server-only";
import { z } from "zod";
import { askJson } from "../lessonGenerator";
import { sarvamChat } from "../sarvamChat";

/**
 * Lesson Assistant, Sarvam calls that don't touch lessons: understand the admin's request and,
 * when no document was given, write the chapter notes the course is made from.
 */

export type Usage = { promptTokens: number; completionTokens: number };
export type Track = (u: Usage) => void;
const MODEL = { model: "sarvam-105b-conversations" as const };

export const requestSchema = z.object({
  /** Set when the request is too vague to act on: the assistant asks this instead. */
  question: z.string().nullish(),
  course: z.string().nullish(),
  chapter: z.string().nullish(),
  board: z.string().nullish(),
  level: z.string().nullish(),
  subject: z.string().nullish(),
  /** Anything specific the admin asked for (focus, examples, what to leave out). */
  notes: z.string().nullish(),
  videos: z.boolean().nullish(),
  pictures: z.boolean().nullish(),
});
export type LessonRequest = z.infer<typeof requestSchema>;

const UNDERSTAND_SYSTEM = `You help a school admin add lessons to a voice-tutor app for learners in India (taught in Telugu, Hindi and English).
Read the admin's request and return only JSON:
{"question": null, "course": "short course name, e.g. Class 10 Biology - Life Processes", "chapter": "the chapter or topic", "board": "e.g. Andhra Pradesh State Board, CBSE, or null", "level": "e.g. Class 10, B.Ed, adults, or null", "subject": "e.g. Biology", "notes": "anything specific they asked for, or null", "videos": true, "pictures": true}
- "videos"/"pictures": false only if the admin says they don't want them.
- If the request doesn't say WHAT to teach (no topic, chapter or document), set "question" to one short question asking for it, and the rest to null.
- If a document is attached, take the topic from it.`;

export async function understandRequest(message: string, documentStart: string | null, track: Track): Promise<LessonRequest> {
  const json = await askJson(
    [
      { role: "system", content: UNDERSTAND_SYSTEM },
      {
        role: "user",
        content: `Request: ${message}${documentStart ? `\n\nAttached document (start):\n${documentStart.slice(0, 1500)}` : "\n\n(No document attached.)"}`,
      },
    ],
    { ...MODEL, maxTokens: 600, temperature: 0.1 },
    track,
  );
  return requestSchema.parse(json);
}

const CHAPTER_SYSTEM = `You write the teaching notes for one chapter, which a tutor app turns into short spoken lessons.
Rules:
- Simple English for school learners. Short sentences. Explain each term the first time it appears.
- Only well-established textbook facts for this syllabus. Never invent numbers, dates, names, quotes or examples you are not sure of; leave a fact out rather than guess.
- 900 to 1600 words. 6 to 12 sections, each starting with a "## " heading, in the order the chapter is usually taught.
- Each section: 1 to 3 paragraphs of plain prose. No bullet lists, no tables, no questions, no exercises, no references to pictures or videos.
- Start with "# " and the chapter title on the first line.
Return only the notes, as Markdown text.`;

/** Writes chapter notes from the syllabus (AI-written: the admin must check them). */
export async function writeChapter(req: LessonRequest, track: Track): Promise<string> {
  const brief = [
    `Chapter: ${req.chapter ?? req.course}`,
    req.subject && `Subject: ${req.subject}`,
    req.level && `Level: ${req.level}`,
    req.board && `Board / syllabus: ${req.board}`,
    req.notes && `The admin asked: ${req.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
  const res = await sarvamChat(
    [
      { role: "system", content: CHAPTER_SYSTEM },
      { role: "user", content: brief },
    ],
    { ...MODEL, maxTokens: 6000, temperature: 0.3 },
  );
  track(res.usage);
  const text = res.content.replace(/^```(?:markdown|md)?\s*|\s*```\s*$/g, "").trim();
  if (text.length < 600 || !text.includes("## ")) throw new Error("The chapter notes came back too short. Please try again.");
  return text;
}
