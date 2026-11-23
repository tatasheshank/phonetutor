// Validates every lesson in content/lessons. Exits non-zero if any lesson has errors.
// Usage: npm run validate:lessons            (drafts allowed: reports playable languages)
//        npm run validate:lessons -- --strict (fails unless every lesson is playable)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateLesson } from "../src";

const strict = process.argv.includes("--strict");
const dir = join(import.meta.dirname, "../../../content/lessons");
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const publicDir = join(import.meta.dirname, "../../../apps/web/public");
  const result = validateLesson(JSON.parse(readFileSync(join(dir, file), "utf8")), {
    mediaExists: (src) => !src.includes("..") && existsSync(join(publicDir, src)),
  });
  // Without --strict, "no reviewed pack yet" is expected while content is in draft.
  const errors = strict
    ? result.errors
    : result.errors.filter((e) => !e.startsWith("locales: a scripted lesson needs"));
  const playable = result.playableLanguages.join(", ") || "none (all drafts)";
  if (errors.length) {
    failed = true;
    console.log(`✗ ${file}`);
    for (const e of errors) console.log(`    ${e}`);
  } else {
    console.log(`✓ ${file}  playable: ${playable}`);
  }
}

process.exit(failed ? 1 : 0);
