// Pre-records the tutor's scripted lines so learners hear saved audio instead of paid live speech.
//
//   npm run prerecord -w @ai-tutor/agent                 # dry run: lists lines and estimated cost
//   npm run prerecord -w @ai-tutor/agent -- --yes        # record (default voice, normal speed)
//   ... -- --yes --voices=all --rates=all                # every voice and speed (much more)
//   ... -- --yes --lang=te                               # one language only
//   ... -- --lesson=<id> [--yes] [--json]                # one lesson only (used by the admin page)
//
// Already-recorded lines are skipped, so re-running only records new or edited lines.
// Lines not pre-recorded still get recorded automatically the first time a learner hears them.
import "dotenv/config";
import {
  availableLanguages,
  isLanguageCode,
  PRICES,
  resolveVoice,
  type LanguageConfig,
  type SpeechRate,
  type VoiceOption,
} from "@ai-tutor/shared";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isCached, synthesizeToCache, ttsCacheDir, voiceKey } from "../src/audioCache";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const yes = args.includes("--yes");
const allVoices = flag("voices") === "all";
const rates: SpeechRate[] = flag("rates") === "all" ? ["slow", "normal", "fast"] : ["normal"];
const onlyLang = flag("lang");
const allowDrafts = process.env.ALLOW_DRAFT_LESSONS === "true" || args.includes("--drafts");
const onlyLesson = flag("lesson");
if (onlyLesson !== undefined && !/^[a-z0-9-]{1,80}$/.test(onlyLesson)) {
  console.error("bad --lesson id");
  process.exit(2);
}
/** --json: print one machine-readable summary line ("JSON {...}") for the admin page. */
const json = args.includes("--json");

const lessonsDir = join(import.meta.dirname, "../../../content/lessons");

/** Every line the tutor can speak from fixed text, for one language. Mirrors LessonRunner. */
function linesFor(lang: LanguageConfig): string[] {
  const lines = new Set<string>();
  const p = lang.phrases;
  if (!onlyLesson) {
    for (const v of Object.values(p)) lines.add(v);
    lines.add(p.wellDone.split(/[!.।]/)[0] + "!");
    lines.add(p.letMeShow.split(/[,.،]/)[0] + ".");
  }

  const files = readdirSync(lessonsDir).filter((f) => f.endsWith(".json") && (!onlyLesson || f === `${onlyLesson}.json`));
  for (const file of files) {
    const lesson = JSON.parse(readFileSync(join(lessonsDir, file), "utf8"));
    const pack = lesson.locales?.[lang.code];
    if (!pack || (pack.status !== "reviewed" && !allowDrafts)) continue;
    for (const s of Object.values(pack.steps ?? {}) as Array<{ text?: string; question?: string; cues?: Array<{ text?: string }> }>) {
      if (s.text) lines.add(s.text);
      if (s.question) lines.add(s.question);
      for (const c of s.cues ?? []) if (c.text) lines.add(c.text);
    }
  }
  return [...lines].map((l) => l.trim()).filter(Boolean);
}

type Job = { lang: LanguageConfig; voice: VoiceOption; rate: SpeechRate; text: string };
const jobs: Job[] = [];
for (const lang of availableLanguages()) {
  if (onlyLang && (!isLanguageCode(onlyLang) || onlyLang !== lang.code)) continue;
  const voices = allVoices ? lang.voices : [resolveVoice(lang)];
  const lines = linesFor(lang);
  for (const voice of voices)
    for (const rate of rates)
      for (const text of lines)
        if (!isCached(text, voiceKey(lang, voice, rate))) jobs.push({ lang, voice, rate, text });
}

const price = (j: Job) => j.text.length * (PRICES.ttsPerChar[j.voice.model] ?? PRICES.ttsPerChar["bulbul:v3"]!);
const chars = jobs.reduce((n, j) => n + j.text.length, 0);
const cost = jobs.reduce((n, j) => n + price(j), 0);

const summary = new Map<string, { lines: number; chars: number }>();
for (const j of jobs) {
  const k = `${j.lang.code} · ${j.voice.id} · ${j.rate}`;
  const s = summary.get(k) ?? { lines: 0, chars: 0 };
  s.lines++;
  s.chars += j.text.length;
  summary.set(k, s);
}
console.log(`Cache: ${ttsCacheDir()}`);
console.log(`Lessons: ${allowDrafts ? "reviewed + drafts" : "reviewed only"} · voices: ${allVoices ? "all" : "default"} · speeds: ${rates.join(", ")}`);
for (const [k, s] of summary) console.log(`  ${k}: ${s.lines} lines, ${s.chars} characters`);
console.log(`To record: ${jobs.length} lines, ${chars} characters, about Rs ${cost.toFixed(2)} (one time).`);

if (json) console.log(`JSON ${JSON.stringify({ phase: "estimate", lines: jobs.length, chars, costInr: Math.round(cost * 100) / 100 })}`);
if (!jobs.length) {
  console.log("Nothing to record: everything is already saved.");
  process.exit(0);
}
if (!yes) {
  console.log("Dry run. Add --yes to record.");
  process.exit(0);
}

let done = 0;
let spent = 0;
let failed = 0;
for (const j of jobs) {
  try {
    await synthesizeToCache(j.text, voiceKey(j.lang, j.voice, j.rate));
    done++;
    spent += price(j);
    if (done % 10 === 0 || done === jobs.length) console.log(`  recorded ${done}/${jobs.length} (Rs ${spent.toFixed(2)})`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${j.lang.code}/${j.voice.id}/${j.rate}: ${(err as Error).message}`);
  }
}
console.log(`Done: ${done} recorded, ${failed} failed, about Rs ${spent.toFixed(2)} spent.`);
if (json) console.log(`JSON ${JSON.stringify({ phase: "done", recorded: done, failed, costInr: Math.round(spent * 100) / 100 })}`);
process.exit(failed ? 1 : 0);
