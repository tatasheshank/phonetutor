import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { availableLanguages, getLanguage, isSpeechRate, resolveVoice, SPEECH_RATES } from "../src";

const publicVoices = join(__dirname, "../../../apps/web/public/voices");

describe("voice options", () => {
  for (const lang of availableLanguages()) {
    describe(lang.name.en, () => {
      it("has a default voice that is in the picker list", () => {
        expect(lang.voices.some((v) => v.id === lang.tts.voice)).toBe(true);
      });

      it("has unique voice ids", () => {
        const ids = lang.voices.map((v) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("only uses temperature on bulbul:v3", () => {
        for (const v of lang.voices) if (v.temperature) expect(v.model).toBe("bulbul:v3");
      });

      it("has a sample clip for every voice", () => {
        for (const v of lang.voices) {
          expect(existsSync(join(publicVoices, lang.code, `${v.id}.mp3`)), `${lang.code}/${v.id}.mp3`).toBe(true);
        }
      });
    });
  }
});

describe("resolveVoice", () => {
  const te = getLanguage("te");

  it("returns the chosen voice", () => {
    expect(resolveVoice(te, "tarun-storyteller").speaker).toBe("tarun_te_narration");
  });

  it("falls back to the default for unknown or missing ids", () => {
    expect(resolveVoice(te, "nope").id).toBe(te.tts.voice);
    expect(resolveVoice(te).id).toBe(te.tts.voice);
    expect(resolveVoice(te, null).id).toBe(te.tts.voice);
  });
});

describe("speech rates", () => {
  it("defaults to natural speed and validates values", () => {
    expect(SPEECH_RATES.normal).toBe(1);
    expect(isSpeechRate("slow")).toBe(true);
    expect(isSpeechRate("turbo")).toBe(false);
  });
});
