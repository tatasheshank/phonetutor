import type { LanguageConfig, SpeechRate, VoiceOption } from "@ai-tutor/shared";
import { SPEECH_RATES } from "@ai-tutor/shared";
import { AudioFrame } from "@livekit/rtc-node";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

/**
 * Pre-recorded tutor audio.
 *
 * Scripted lines (lesson steps, hints, board narration, greetings, "shall we continue") are the same
 * for every learner, so each line is synthesized ONCE per voice and speed, saved as a WAV file, and
 * replayed from disk afterwards: no Sarvam call, no cost. Live AI answers still use live speech.
 *
 * Files: data/tts-cache/<sha256 of voice + speed + text>.wav (24 kHz mono 16-bit, the agent's output rate).
 * Changing a lesson's text changes the hash, so edited lines are re-recorded automatically.
 */
export const SAMPLE_RATE = 24_000;
const FRAME_SAMPLES = SAMPLE_RATE / 50; // 20 ms frames

export interface VoiceKey {
  model: VoiceOption["model"];
  speaker: string;
  bcp47: string;
  pace: number;
  temperature?: number;
}

export function voiceKey(lang: LanguageConfig, voice: VoiceOption, rate: SpeechRate): VoiceKey {
  return {
    model: voice.model,
    speaker: voice.speaker,
    bcp47: lang.bcp47,
    pace: SPEECH_RATES[rate],
    ...(voice.model === "bulbul:v3" && voice.temperature ? { temperature: voice.temperature } : {}),
  };
}

export function ttsCacheDir(): string {
  if (process.env.TTS_CACHE_DIR) return resolve(process.env.TTS_CACHE_DIR);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  return resolve(repoRoot, "data/tts-cache");
}

/** Whitespace-normalised so trivial spacing edits don't force a re-recording. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function cacheKey(text: string, key: VoiceKey): string {
  const id = JSON.stringify({ v: 1, ...key, text: normalise(text) });
  return createHash("sha256").update(id).digest("hex");
}

export function cachedPath(text: string, key: VoiceKey, dir = ttsCacheDir()): string {
  return join(dir, `${cacheKey(text, key)}.wav`);
}

export function isCached(text: string, key: VoiceKey, dir = ttsCacheDir()): boolean {
  return existsSync(cachedPath(text, key, dir));
}

/** Calls Sarvam once and saves the WAV. Returns the characters billed. */
export async function synthesizeToCache(
  text: string,
  key: VoiceKey,
  apiKey = process.env.SARVAM_API_KEY ?? "",
  dir = ttsCacheDir(),
): Promise<number> {
  const clean = normalise(text);
  if (!clean) return 0;
  if (!apiKey) throw new Error("SARVAM_API_KEY is not set");
  const body: Record<string, unknown> = {
    text: clean,
    target_language_code: key.bcp47,
    speaker: key.speaker,
    model: key.model,
    pace: key.pace,
    speech_sample_rate: String(SAMPLE_RATE),
    output_audio_codec: "wav",
  };
  if (key.temperature) body.temperature = key.temperature;
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "content-type": "application/json", "api-subscription-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => ({}))) as { audios?: string[] };
  if (!res.ok || !json.audios?.length) throw new Error(`Sarvam TTS ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  // Long lines may come back in several chunks: join their PCM into one file.
  const pcm = Buffer.concat(json.audios.map((a) => wavPcm(Buffer.from(a, "base64"))));
  const path = cachedPath(text, key, dir);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, makeWav(pcm, SAMPLE_RATE));
  await rename(tmp, path);
  return clean.length;
}

/** The PCM bytes of a 16-bit WAV (finds the "data" chunk; tolerates extra chunks). */
export function wavPcm(wav: Buffer): Buffer {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a WAV file");
  }
  let off = 12;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === "data") return wav.subarray(off + 8, Math.min(wav.length, off + 8 + size));
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function makeWav(pcm: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Streams a cached WAV as 20 ms LiveKit audio frames. */
export function wavFrames(path: string): ReadableStream<AudioFrame> {
  let samples: Int16Array | null = null;
  let pos = 0;
  return new ReadableStream<AudioFrame>({
    async pull(controller) {
      if (!samples) {
        const pcm = wavPcm(await readFile(path));
        // Copy into an aligned buffer: Int16Array needs an even byte offset.
        const aligned = new Uint8Array(pcm.length - (pcm.length % 2));
        aligned.set(pcm.subarray(0, aligned.length));
        samples = new Int16Array(aligned.buffer);
      }
      if (pos >= samples.length) {
        controller.close();
        return;
      }
      const n = Math.min(FRAME_SAMPLES, samples.length - pos);
      controller.enqueue(new AudioFrame(samples.slice(pos, pos + n), SAMPLE_RATE, 1, n));
      pos += n;
    },
  });
}

/** Minimal session surface used here (kept structural for tests). */
export interface SayingSession<H> {
  say(text: string, options?: { audio?: ReadableStream<AudioFrame>; allowInterruptions?: boolean }): H;
}

/**
 * Speaks scripted lines from the cache when possible.
 * Cache hit: plays the saved recording (free). Cache miss: speaks live as before AND records the line
 * in the background, so the next learner gets it free. `onRecorded` reports characters billed.
 */
export class ScriptedSpeech<H> {
  private inFlight = new Set<string>();
  hits = 0;
  misses = 0;

  constructor(
    private readonly session: SayingSession<H>,
    private readonly key: VoiceKey,
    private readonly onRecorded: (chars: number) => void = () => {},
    private readonly dir = ttsCacheDir(),
  ) {}

  say(text: string, options: { allowInterruptions?: boolean } = {}): H {
    const path = cachedPath(text, this.key, this.dir);
    if (existsSync(path)) {
      this.hits++;
      return this.session.say(text, { ...options, audio: wavFrames(path) });
    }
    this.misses++;
    if (!this.inFlight.has(path)) {
      this.inFlight.add(path);
      synthesizeToCache(text, this.key, undefined, this.dir)
        .then((chars) => this.onRecorded(chars))
        .catch((err) => console.warn("[audio-cache] could not record line", err))
        .finally(() => this.inFlight.delete(path));
    }
    return this.session.say(text, options);
  }
}
