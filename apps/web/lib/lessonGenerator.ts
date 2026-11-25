import "server-only";
import {
  getLanguage,
  lessonFromPlan,
  lessonPlanSchema,
  mergeTranslatedPack,
  SCREEN_MANIFEST,
  SCREEN_NAV,
  slugify,
  TARGET_DESCRIPTIONS,
  uploadedMediaUrl,
  validateLesson,
  videoLessonFromPlan,
  videoPlanSchema,
  type LanguageCode,
  type Lesson,
  type LocalePack,
} from "@ai-tutor/shared";
import { randomBytes } from "node:crypto";
import { parseJsonObject, sarvamChat, SarvamError, type ChatMessage, type ChatOptions } from "./sarvamChat";
import type { SourceText } from "./lessonSources";

/**
 * Prepares a teacher-demonstration lesson from an admin's file, Sarvam only:
 *  1. Plan (English): steps, screens and buttons, from the file's text.
 *  2. Repair and check the plan against the real screen library (lessonFromPlan).
 *  3. Translate the teacher's lines into Telugu and Hindi, in spoken style.
 *  4. Validate. The result is a DRAFT: an admin previews and publishes it.
 */

export interface GeneratedLesson {
  lesson: Lesson;
  warnings: string[];
  usage: { promptTokens: number; completionTokens: number };
}

function screenCatalog(): string {
  return Object.entries(SCREEN_MANIFEST)
    .map(([id, s]) => {
      const buttons = s.targets.map((t) => `    - ${t}: ${TARGET_DESCRIPTIONS[t] ?? t}`).join("\n");
      const nav = Object.entries(SCREEN_NAV[id as keyof typeof SCREEN_NAV] ?? {})
        .map(([t, to]) => `${t} → ${to}`)
        .join(", ");
      return `- ${id}: ${s.description}\n  Buttons:\n${buttons}${nav ? `\n  Pressing leads to: ${nav}` : ""}`;
    })
    .join("\n");
}

const PLAN_SYSTEM = () => `You turn a document into a short phone lesson for older people in India who are new to smartphones.
A teacher DEMONSTRATES on a simulated phone and explains; the learner only watches and listens.

Simulated phone screens you may use (use ONLY these exact ids):
${screenCatalog()}

If the topic needs a screen or button that is not listed, use kind "explain" with no screen. Never invent screen or button ids.

Step kinds:
- "explain": the teacher talks (no screen).
- "show": the teacher shows "screen" and points at "target" (optional) while saying "text".
- "press": the teacher points at "target" on "screen", says "text", then presses it; the phone moves on as listed under "Pressing leads to". Use one "press" step for a button; don't add a separate "show" step for the same button before it.
- "check": exactly one, last: a yes/no question of the form "Did you understand how to ...?" with "accept": short spoken ways to say yes. It must not introduce anything new.

Rules:
- 4 to 10 steps, in the real order of the task. One idea per step.
- Cover EVERY action the document describes, in order, including the last one (for example ending a call). Do not turn an action into the question.
- "text" is what the teacher says aloud: simple everyday English, 1-2 short sentences, at most 30 words. Describe buttons by colour, shape and position. Speak as the one doing it ("Now I press the camera button").
- Follow the real flow: each "press" must be on the screen the previous press led to.
- Whenever the task happens inside a chat or a call, start on "wa.chats" and PRESS the right row to open it: "row.beta" for the son Ravi, "row.family" for the Family group. Don't just say "open the chat": show it. The chat and call screens then show that person or group.
- Speak as the teacher doing it ("I press ..."), never tell the learner to tap; the learner only watches.
- Only teach what the document says. Do not invent features.
- Never tell anyone to share an OTP, PIN or password; only warn never to share them.

Return JSON only, no other text:
{"title": "...", "objectives": ["..."], "steps": [{"kind": "explain|show|press|check", "screen": "...", "target": "...", "text": "...", "question": "...", "accept": ["..."]}]}`;

const TRANSLATE_SYSTEM = (lang: LanguageCode) => {
  const l = getLanguage(lang);
  return `Translate a lesson for older learners into ${l.name.en}, as the teacher would SAY it aloud.
The teacher is a woman: where the language marks gender in the FIRST person (e.g. Hindi "मैं दबाती हूँ", not "दबाता हूँ"), use the feminine form.
The learner may be a man or a woman: address them respectfully without assuming gender (Hindi: "आप ... कर सकते हैं", never "कर सकती हैं" for the learner; ask "क्या आपको समझ आया ...?", not "क्या आप समझ गए/गईं").
${l.llmStyle}
Keep the JSON shape and every key and step id exactly. Translate "title" and every "text" and "question" faithfully: do not add, drop or change any meaning (a yes/no question stays a yes/no question).
For "accept", give 4 to 8 short ways a learner might say yes in ${l.name.en} (in ${l.name.en} script), plus common code-mixed forms.
Return JSON only, no other text.`;
};

/**
 * Asks for a JSON answer; if the model returns broken JSON, asks once more, showing it the problem.
 * Models occasionally drop a quote or bracket, and a second try almost always fixes it.
 */
async function askJson(
  messages: ChatMessage[],
  opts: ChatOptions,
  track: (u: { promptTokens: number; completionTokens: number }) => void,
): Promise<unknown> {
  const first = await sarvamChat(messages, opts);
  track(first.usage);
  try {
    return parseJsonObject(first.content);
  } catch (err) {
    if (!(err instanceof SarvamError)) throw err;
    console.warn("[lessons] model returned invalid JSON, retrying. Start of answer:", first.content.slice(0, 300));
    const second = await sarvamChat(
      [
        ...messages,
        { role: "assistant", content: first.content },
        { role: "user", content: "That was not valid JSON. Reply again with only the corrected JSON object, nothing else." },
      ],
      { ...opts, temperature: 0 },
    );
    track(second.usage);
    return parseJsonObject(second.content);
  }
}


type Usage = { promptTokens: number; completionTokens: number };
type TranslatedJson = { title?: unknown; steps?: Record<string, { text?: unknown; question?: unknown; accept?: unknown; cues?: unknown }> };
const hasText = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const cueText = (c: unknown) => (typeof c === "string" ? c : (c as { text?: unknown } | undefined)?.text);

/** Step ids whose text, question or cue narration the model didn't translate. */
function missingLines(english: LocalePack, translated: unknown): string[] {
  const t = (translated && typeof translated === "object" ? translated : {}) as TranslatedJson;
  return Object.entries(english.steps)
    .filter(([sid, s]) => {
      const tr = t.steps?.[sid];
      if (s.text && !hasText(tr?.text)) return true;
      if (s.question && !hasText(tr?.question)) return true;
      if (s.cues?.length) {
        const cues = Array.isArray(tr?.cues) ? (tr.cues as unknown[]) : [];
        return s.cues.some((c, i) => c.text && !hasText(cueText(cues[i])));
      }
      return false;
    })
    .map(([sid]) => sid);
}

/** Copies the retried lines into the first translation (in place). */
function fillMissing(translated: unknown, retry: unknown, ids: string[]): void {
  if (!translated || typeof translated !== "object") return;
  const t = translated as TranslatedJson;
  const r = (retry && typeof retry === "object" ? retry : {}) as TranslatedJson;
  t.steps ??= {};
  for (const sid of ids) {
    const got = r.steps?.[sid];
    if (got) t.steps[sid] = { ...t.steps[sid], ...got };
  }
}

/** The English pack in the shape sent for translation. */
function translationInput(en: LocalePack) {
  return {
    title: en.title,
    steps: Object.fromEntries(
      Object.entries(en.steps).map(([sid, s]) => [
        sid,
        {
          ...(s.text ? { text: s.text } : {}),
          ...(s.question ? { question: s.question, accept: [] } : {}),
          ...(s.cues?.length ? { cues: s.cues.map((c) => ({ text: c.text })) } : {}),
        },
      ]),
    ),
  };
}

/**
 * Translates a lesson's English pack into Telugu and Hindi (both at once), retrying once for any
 * lines the model skipped. Falls back to English per line, with warnings.
 */
async function translatePacks(lesson: Lesson, warnings: string[], track: (u: Usage) => void): Promise<void> {
  const en = lesson.locales.en!;
  const input = translationInput(en);
  const translate = async (lang: LanguageCode): Promise<LocalePack> => {
    try {
      const translated = await askJson(
        [
          { role: "system", content: TRANSLATE_SYSTEM(lang) },
          { role: "user", content: JSON.stringify(input) },
        ],
        { model: "sarvam-105b-conversations", maxTokens: 6000, temperature: 0.3 },
        track,
      );
      // Models sometimes skip a line (often the final question). Ask once more for just those.
      const missing = missingLines(en, translated);
      if (missing.length) {
        try {
          const retry = await askJson(
            [
              { role: "system", content: TRANSLATE_SYSTEM(lang) },
              { role: "user", content: JSON.stringify({ steps: Object.fromEntries(missing.map((sid) => [sid, input.steps[sid]])) }) },
            ],
            { model: "sarvam-105b-conversations", maxTokens: 3000, temperature: 0.2 },
            track,
          );
          fillMissing(translated, retry, missing);
        } catch (err) {
          console.warn(`[lessons] ${lang}: retry for missing lines failed`, err);
        }
      }
      const merged = mergeTranslatedPack(en, translated, lang);
      warnings.push(...merged.warnings);
      return merged.pack;
    } catch (err) {
      warnings.push(`${lang}: translation failed (${(err as Error).message}); English is used until it is regenerated.`);
      return mergeTranslatedPack(en, null, lang).pack;
    }
  };
  const [te, hi] = await Promise.all([translate("te"), translate("hi")]);
  lesson.locales = { te, hi, en };
}

function newTracker() {
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const track = (u: Usage) => {
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
  };
  return { usage, track };
}

/** Structure must be clean. "Not reviewed yet" is expected for a draft, and clips are uploaded after it. */
function finalCheck(lesson: Lesson, warnings: string[]) {
  const blocking = validateLesson(lesson).errors.filter((e) => !e.startsWith("locales: a scripted lesson needs"));
  if (blocking.length) warnings.push(...blocking.map((e) => `Check failed: ${e}`));
}

export async function generateLesson(source: SourceText, titleHint?: string): Promise<GeneratedLesson> {
  const { usage, track } = newTracker();

  // 1. Plan in English.
  const planJson = await askJson(
    [
      { role: "system", content: PLAN_SYSTEM() },
      {
        role: "user",
        content: `${titleHint ? `Lesson title wanted: ${titleHint}\n` : ""}Document "${source.fileName}":\n---\n${source.text}\n---`,
      },
    ],
    // No-reasoning model: with reasoning on, Sarvam can spend the whole token budget thinking
    // (finish_reason "length") and return no plan.
    { model: "sarvam-105b-conversations", maxTokens: 4096, temperature: 0.2 },
    track,
  );
  const plan = lessonPlanSchema.parse(planJson);
  if (titleHint?.trim()) plan.title = titleHint.trim();

  // 2. Repair against the screen library.
  const id = `${slugify(plan.title)}-${randomBytes(3).toString("hex")}`;
  const { lesson, warnings } = lessonFromPlan(plan, id);
  warnings.unshift(...source.warnings);

  // 3. Translate (Telugu first: the primary audience).
  await translatePacks(lesson, warnings, track);

  // 4. Validate.
  finalCheck(lesson, warnings);
  return { lesson, warnings, usage };
}

/* Video lessons: computer topics taught with the admin's own screen recordings. */

export interface ClipInfo {
  /** Original file name (clips are used in file-name order). */
  name: string;
  /** Seconds, read by the admin's browser; null if unknown. */
  duration: number | null;
  /** "mp4" or "webm". */
  ext: "mp4" | "webm";
}

const VIDEO_PLAN_SYSTEM = (clips: ClipInfo[]) => `You turn a document into a short lesson for older people in India who are learning to use a COMPUTER (for example Microsoft Excel).
The teacher plays short screen recordings ("clips") on a board, one after another, and explains them aloud. The learner only watches and listens.
There are NO phone screens in this lesson. Never mention WhatsApp or phone apps unless the document does.

Clips, in order (use each exactly once, in this order):
${clips.length ? clips.map((c, i) => `${i + 1}. "${c.name}"${c.duration ? ` (${c.duration.toFixed(0)} s)` : ""}`).join("\n") : "(no clips: use only explain steps)"}
The file names usually say what each clip shows.

Step kinds:
- "explain": the teacher talks, no clip ("text").
- "clip": the teacher plays clip number "clip" (1-based). "intro" (optional) is said before it plays. "cues" are the lines she says while it plays: 1 to 4 per clip, each with "at" (seconds into the clip where that line starts; the first is 0; keep within the clip's length) and "text".
- "check": exactly one, last: a yes/no question "Did you understand how to ...?" with "accept": short spoken ways to say yes.

Rules:
- Follow the document's order. Cover every action it describes, including the last one.
- Each "text" is spoken aloud: simple everyday English, 1-2 short sentences, at most 30 words. Name what is on the screen by its label, colour and position ("the green Excel icon", "the Save button at the top left").
- Speak as the one doing it ("Now I click ..."); the learner only watches.
- Only teach what the document says. Do not invent features or menus.
- Never tell anyone to share an OTP, PIN or password; only warn never to share them.

Return JSON only, no other text:
{"title": "...", "objectives": ["..."], "steps": [{"kind": "explain", "text": "..."}, {"kind": "clip", "clip": 1, "intro": "...", "cues": [{"at": 0, "text": "..."}]}, {"kind": "check", "question": "...", "accept": ["..."]}]}`;

/**
 * Prepares a video lesson draft: plans clips and narration from the document, translates it, and
 * points every clip step at the URL its upload will have (/api/lesson-media/<id>/clip-<step>.<ext>).
 * The admin's page then uploads the clips one by one to those steps.
 */
export async function generateVideoLesson(
  source: SourceText,
  clips: ClipInfo[],
  opts: { title?: string; course?: string } = {},
): Promise<GeneratedLesson> {
  const { usage, track } = newTracker();
  const planJson = await askJson(
    [
      { role: "system", content: VIDEO_PLAN_SYSTEM(clips) },
      {
        role: "user",
        content: `${opts.title ? `Lesson title wanted: ${opts.title}\n` : ""}Document "${source.fileName}":\n---\n${source.text}\n---`,
      },
    ],
    { model: "sarvam-105b-conversations", maxTokens: 6000, temperature: 0.2 },
    track,
  );
  const plan = videoPlanSchema.parse(planJson);
  if (opts.title?.trim()) plan.title = opts.title.trim();

  const id = `${slugify(plan.title)}-${randomBytes(3).toString("hex")}`;
  const planned = clips.map((c) => ({
    label: c.name,
    duration: c.duration,
    src: (stepId: string) => uploadedMediaUrl(id, `clip-${stepId}.${c.ext}`),
  }));
  const { lesson, warnings } = videoLessonFromPlan(plan, id, planned, opts.course || "computer-basics");
  warnings.unshift(...source.warnings);
  if (clips.length) warnings.push("Set where the teacher points, and fine-tune the timings, in each clip's cue editor below.");

  await translatePacks(lesson, warnings, track);
  finalCheck(lesson, warnings);
  return { lesson, warnings, usage };
}

/**
 * Translates short English lines (e.g. board narration from the cue editor) into one language.
 * Lines the model drops come back empty, so the admin sees what still needs words.
 */
export async function translateLines(lines: string[], lang: LanguageCode): Promise<{ lines: string[]; usage: Usage }> {
  const { usage, track } = newTracker();
  if (lang === "en" || lines.length === 0) return { lines: [...lines], usage };
  const out = (await askJson(
    [
      {
        role: "system",
        content: `${TRANSLATE_SYSTEM(lang)}\nYou get {"lines": ["..."]}: return {"lines": ["..."]} with exactly the same number of lines, in the same order.`,
      },
      { role: "user", content: JSON.stringify({ lines }) },
    ],
    { model: "sarvam-105b-conversations", maxTokens: 4000, temperature: 0.2 },
    track,
  )) as { lines?: unknown };
  const got = Array.isArray(out?.lines) ? out.lines : [];
  return { lines: lines.map((_, i) => (typeof got[i] === "string" ? (got[i] as string).trim() : "")), usage };
}
