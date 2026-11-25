import { getLanguage, resolveVoice } from "@ai-tutor/shared";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedPath,
  cacheKey,
  isCached,
  makeWav,
  SAMPLE_RATE,
  ScriptedSpeech,
  synthesizeToCache,
  voiceKey,
  wavFrames,
  wavPcm,
} from "../src/audioCache";

const te = getLanguage("te");
const key = voiceKey(te, resolveVoice(te), "normal");
const tmp = () => mkdtempSync(join(tmpdir(), "tts-cache-"));

/** A fake Sarvam response: 0.1 s of a ramp signal as a WAV. */
function fakeSarvam() {
  const pcm = Buffer.alloc(SAMPLE_RATE * 0.1 * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(i % 1000, i * 2);
  const wav = makeWav(pcm, SAMPLE_RATE);
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body).text);
    return new Response(JSON.stringify({ audios: [wav.toString("base64")] }), { status: 200 });
  });
  return calls;
}

process.env.SARVAM_API_KEY ??= "test-key"; // fetch is faked; the key is never sent anywhere
afterEach(() => vi.unstubAllGlobals());

describe("cache keys", () => {
  it("are stable, ignore extra spaces, and differ by voice, speed and text", () => {
    expect(cacheKey("నమస్కారం  అమ్మా", key)).toBe(cacheKey(" నమస్కారం అమ్మా ", key));
    expect(cacheKey("a", key)).not.toBe(cacheKey("b", key));
    expect(cacheKey("a", key)).not.toBe(cacheKey("a", voiceKey(te, resolveVoice(te), "slow")));
    expect(cacheKey("a", key)).not.toBe(cacheKey("a", voiceKey(te, resolveVoice(te, "tarun-storyteller"), "normal")));
  });
});

describe("WAV handling", () => {
  it("round-trips PCM and splits it into 20 ms frames", async () => {
    const dir = tmp();
    const pcm = Buffer.alloc(SAMPLE_RATE * 0.05 * 2 + 2); // 50 ms + 1 sample
    const path = join(dir, "x.wav");
    writeFileSync(path, makeWav(pcm, SAMPLE_RATE));
    expect(wavPcm(makeWav(pcm, SAMPLE_RATE)).length).toBe(pcm.length);

    const sizes: number[] = [];
    const reader = wavFrames(path).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      expect(value.sampleRate).toBe(SAMPLE_RATE);
      sizes.push(value.samplesPerChannel);
    }
    expect(sizes).toEqual([480, 480, 241]);
  });

  it("rejects non-WAV data", () => {
    expect(() => wavPcm(Buffer.from("hello world, not audio"))).toThrow();
  });
});

describe("synthesizeToCache", () => {
  it("calls Sarvam once and saves the line", async () => {
    const calls = fakeSarvam();
    const dir = tmp();
    const chars = await synthesizeToCache("ఈ రోజు వీడియో కాల్", key, "test-key", dir);
    expect(chars).toBe("ఈ రోజు వీడియో కాల్".length);
    expect(calls).toEqual(["ఈ రోజు వీడియో కాల్"]);
    expect(isCached("ఈ రోజు వీడియో కాల్", key, dir)).toBe(true);
  });
});

describe("ScriptedSpeech", () => {
  it("speaks live and records on a miss, then plays the recording for free", async () => {
    const calls = fakeSarvam();
    const dir = tmp();
    const said: Array<{ text: string; recorded: boolean }> = [];
    const session = { say: (text: string, o?: { audio?: unknown }) => (said.push({ text, recorded: !!o?.audio }), "handle") };
    let billed = 0;
    const scripted = new ScriptedSpeech(session, key, (c) => (billed += c), dir);

    scripted.say("hello");
    expect(said.at(-1)).toEqual({ text: "hello", recorded: false });
    await vi.waitFor(() => expect(isCached("hello", key, dir)).toBe(true));
    expect(billed).toBe(5);

    scripted.say("hello");
    expect(said.at(-1)).toEqual({ text: "hello", recorded: true });
    expect(calls).toEqual(["hello"]); // Sarvam called once in total
    expect([scripted.hits, scripted.misses]).toEqual([1, 1]);
  });

  it("records each line once even if it is said twice before the recording finishes", async () => {
    const calls = fakeSarvam();
    const dir = tmp();
    const scripted = new ScriptedSpeech({ say: () => "h" }, key, () => {}, dir);
    scripted.say("again");
    scripted.say("again");
    await vi.waitFor(() => expect(isCached("again", key, dir)).toBe(true));
    expect(calls).toEqual(["again"]);
    expect(cachedPath("again", key, dir)).toMatch(/[0-9a-f]{64}\.wav$/);
  });
});
