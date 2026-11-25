import { ALL_LANGUAGE_CODES, type LanguageCode } from "../languages";
import { isScreenId, screenHasTarget } from "../screens/manifest";
import { locateMedia } from "./media";
import { lessonSchema, type Lesson, type LocalePack } from "./schema";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  lesson?: Lesson;
  /** Languages with a reviewed, complete locale pack. Only these can be played to learners. */
  playableLanguages: LanguageCode[];
}

/**
 * Validates a lesson in two passes:
 * 1. Shape (zod schema).
 * 2. Meaning: screens and tap targets exist in the screen library, step ids are unique,
 *    and every reviewed locale pack covers every step and quiz item.
 */
export interface ValidateOptions {
  /**
   * Checks that a media path like "/lesson-media/x.mp4" exists. The shared package has no file
   * system access, so callers that can check (agent, web server, validate script) pass this in.
   */
  mediaExists?: (src: string) => boolean;
}

export function validateLesson(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      playableLanguages: [],
    };
  }

  const lesson = parsed.data;
  const errors: string[] = [];

  // Step ids unique.
  const seen = new Set<string>();
  for (const step of lesson.steps) {
    if (seen.has(step.id)) errors.push(`steps: duplicate step id "${step.id}"`);
    seen.add(step.id);
  }

  // Screens and targets exist.
  for (const screen of lesson.screens) {
    if (!isScreenId(screen)) errors.push(`screens: unknown screen "${screen}"`);
  }
  const checkScreen = (where: string, screen: string, target?: string) => {
    if (!isScreenId(screen)) {
      errors.push(`${where}: unknown screen "${screen}"`);
      return;
    }
    if (!lesson.screens.includes(screen)) {
      errors.push(`${where}: screen "${screen}" is not listed in lesson.screens`);
    }
    if (target !== undefined && !screenHasTarget(screen, target)) {
      errors.push(`${where}: screen "${screen}" has no target "${target}"`);
    }
  };
  for (const step of lesson.steps) {
    if (step.type === "show") checkScreen(`steps.${step.id}`, step.screen, step.highlight);
    if (step.type === "practice") checkScreen(`steps.${step.id}`, step.screen, step.expect.tap);
  }
  for (const q of lesson.quiz) {
    if (q.kind === "tap") checkScreen(`quiz.${q.id}`, q.screen, q.expect.tap);
  }

  // Classroom-board videos: cue times go forward, media files exist.
  for (const step of lesson.steps) {
    if (step.type !== "video") continue;
    for (let i = 1; i < step.cues.length; i++) {
      if (step.cues[i]!.at <= step.cues[i - 1]!.at) {
        errors.push(`steps.${step.id}.cues.${i}: "at" must be later than the previous cue`);
      }
    }
    for (const src of [step.src, step.poster]) {
      if (src && !locateMedia(src)) errors.push(`steps.${step.id}: media path "${src}" is not allowed`);
      else if (src && options.mediaExists && !options.mediaExists(src)) {
        errors.push(`steps.${step.id}: media file "${src}" not found`);
      }
    }
  }

  // Locale packs.
  const playable: LanguageCode[] = [];
  for (const code of ALL_LANGUAGE_CODES) {
    const pack = lesson.locales[code];
    if (!pack) continue;
    const packErrors = checkLocalePack(lesson, code, pack);
    if (pack.status === "reviewed") {
      errors.push(...packErrors);
      if (packErrors.length === 0) playable.push(code);
    }
    // Draft packs may be incomplete; they are simply not playable.
  }

  if (lesson.mode === "scripted" && playable.length === 0) {
    errors.push("locales: a scripted lesson needs at least one reviewed locale pack");
  }

  return { ok: errors.length === 0, errors, lesson, playableLanguages: playable };
}

function checkLocalePack(lesson: Lesson, code: LanguageCode, pack: LocalePack): string[] {
  const errors: string[] = [];
  const at = (id: string) => `locales.${code}.steps.${id}`;

  for (const step of lesson.steps) {
    const s = pack.steps[step.id];
    if (!s) {
      errors.push(`${at(step.id)}: missing`);
      continue;
    }
    switch (step.type) {
      case "say":
      case "show":
        if (!s.text) errors.push(`${at(step.id)}: needs text`);
        break;
      case "practice":
        if (!s.text) errors.push(`${at(step.id)}: needs text`);
        break;
      case "check":
        if (!s.question) errors.push(`${at(step.id)}: needs question`);
        if (!s.accept || s.accept.length === 0) errors.push(`${at(step.id)}: needs accept answers`);
        break;
      case "video":
        if ((s.cues?.length ?? 0) !== step.cues.length) {
          errors.push(`${at(step.id)}: needs narration for each of the ${step.cues.length} cues`);
        } else if (s.cues!.some((c) => !c.text.trim())) {
          errors.push(`${at(step.id)}: every cue needs narration text`);
        }
        break;
    }
  }

  for (const q of lesson.quiz) {
    if (!pack.quiz[q.id]) errors.push(`locales.${code}.quiz.${q.id}: missing`);
  }

  if (pack.status === "reviewed" && !pack.reviewer) {
    errors.push(`locales.${code}: reviewed pack needs a reviewer name`);
  }

  // Never-say phrases must not appear in any tutor text.
  const banned = [...lesson.safety.neverSay, ...pack.neverSay].map((p) => p.toLowerCase());
  const texts = [
    pack.title,
    ...Object.values(pack.steps).flatMap((s) => [s.text, s.question, ...(s.hints ?? []), ...(s.cues ?? []).flatMap((c) => [c.text, c.caption])]),
    ...Object.values(pack.quiz).flatMap((q) => [q.prompt, q.correction]),
  ].filter((t): t is string => typeof t === "string");
  for (const text of texts) {
    for (const phrase of banned) {
      if (phrase && text.toLowerCase().includes(phrase)) {
        errors.push(`locales.${code}: contains never-say phrase "${phrase}"`);
      }
    }
  }

  return errors;
}
