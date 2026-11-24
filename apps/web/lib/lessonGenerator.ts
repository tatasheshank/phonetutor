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
  validateLesson,
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
- Only teach what the document says. Do not invent features.
- Never tell anyone to share an OTP, PIN or password; only warn never to share them.

Return JSON only, no other text:
{"title": "...", "objectives": ["..."], "steps": [{"kind": "explain|show|press|check", "screen": "...", "target": "...", "text": "...", "question": "...", "accept": ["..."]}]}`;

const TRANSLATE_SYSTEM = (lang: LanguageCode) => {
  const l = getLanguage(lang);
  return `Translate a phone lesson for older learners into ${l.name.en}, as the teacher would SAY it aloud.
The teacher is a woman: where the language marks gender in the first person (e.g. Hindi "मैं दबाती हूँ", not "दबाता हूँ"), use the feminine form.
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

export async function generateLesson(source: SourceText, titleHint?: string): Promise<GeneratedLesson> {
  const usage = { promptTokens: 0, completionTokens: 0 };
  const track = (u: { promptTokens: number; completionTokens: number }) => {
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
  };

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
  const en = lesson.locales.en!;

  // 3. Translate (Telugu first: the primary audience). Run both at once.
  const forTranslation = {
    title: en.title,
    steps: Object.fromEntries(
      Object.entries(en.steps).map(([sid, s]) => [sid, { ...(s.text ? { text: s.text } : {}), ...(s.question ? { question: s.question, accept: [] } : {}) }]),
    ),
  };
  const translate = async (lang: LanguageCode): Promise<LocalePack> => {
    try {
      const translated = await askJson(
        [
          { role: "system", content: TRANSLATE_SYSTEM(lang) },
          { role: "user", content: JSON.stringify(forTranslation) },
        ],
        { model: "sarvam-105b-conversations", maxTokens: 4096, temperature: 0.3 },
        track,
      );
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

  // 4. Validate (structure must be clean; "not reviewed yet" is expected for a draft).
  const blocking = validateLesson(lesson).errors.filter((e) => !e.startsWith("locales: a scripted lesson needs"));
  if (blocking.length) warnings.push(...blocking.map((e) => `Check failed: ${e}`));

  return { lesson, warnings, usage };
}
