// Generates the short clips learners hear in the voice picker:
//   apps/web/public/voices/<lang>/<voice id>.mp3
// Run after adding or changing voices in src/languages/*.ts:
//   npm run voice-samples -w @ai-tutor/shared            (only missing clips)
//   npm run voice-samples -w @ai-tutor/shared -- --all   (regenerate everything)
// Needs SARVAM_API_KEY (read from apps/agent/.env). Costs a few paise per clip.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { availableLanguages, SPEECH_RATES } from "../src";

const root = join(import.meta.dirname, "../../..");
const outRoot = join(root, "apps/web/public/voices");
const all = process.argv.includes("--all");

function sarvamKey(): string {
  if (process.env.SARVAM_API_KEY) return process.env.SARVAM_API_KEY;
  const env = readFileSync(join(root, "apps/agent/.env"), "utf8");
  const m = env.match(/^SARVAM_API_KEY=(.+)$/m);
  if (!m) throw new Error("SARVAM_API_KEY not found in apps/agent/.env");
  return m[1]!.trim();
}

const key = sarvamKey();
let made = 0;
let failed = 0;

for (const lang of availableLanguages()) {
  const dir = join(outRoot, lang.code);
  mkdirSync(dir, { recursive: true });
  for (const v of lang.voices) {
    const file = join(dir, `${v.id}.mp3`);
    if (!all && existsSync(file)) continue;
    const body: Record<string, unknown> = {
      text: lang.phrases.greeting,
      target_language_code: lang.bcp47,
      speaker: v.speaker,
      model: v.model,
      pace: SPEECH_RATES.normal,
      speech_sample_rate: "22050",
      output_audio_codec: "mp3",
    };
    if (v.model === "bulbul:v3" && v.temperature) body.temperature = v.temperature;
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "content-type": "application/json", "api-subscription-key": key },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { audios?: string[] };
    if (!res.ok || !json.audios?.[0]) {
      failed++;
      console.log(`✗ ${lang.code}/${v.id} (${v.speaker}, ${v.model}): ${res.status} ${JSON.stringify(json).slice(0, 160)}`);
      continue;
    }
    writeFileSync(file, Buffer.from(json.audios[0], "base64"));
    made++;
    console.log(`✓ ${lang.code}/${v.id}`);
  }
}
console.log(`\n${made} clip(s) generated, ${failed} failed.`);
process.exit(failed ? 1 : 0);
