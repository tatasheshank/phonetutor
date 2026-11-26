import "server-only";
import { isFreeLicence, pickedIndex, pictureCredit, setStepImage } from "@ai-tutor/shared";
import { loadDraft, updateDraft } from "../lessonDrafts";
import { askJson } from "../lessonGenerator";
import { checkUpload, saveUpload } from "../lessonMedia";
import type { LessonRequest, Track } from "./ai";
import { stepList } from "./videos";

/**
 * Lesson Assistant: finds pictures on Wikimedia Commons (free, no key) for a lesson's talk steps.
 * Only free licences (public domain, CC0, CC BY, CC BY-SA, GODL-India); each picture keeps a credit
 * line. Pictures are saved with the lesson's uploads (data/lesson-media), not in the code.
 */

const MAX_PICTURES = 3;
const USER_AGENT = "ai-tutor-lessons/1.0 (educational app)";
const API = "https://commons.wikimedia.org/w/api.php";

interface Picture {
  title: string;
  thumb: string;
  licence: string;
  artist: string;
  description: string;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wikimedia asks anonymous clients to go slowly and answers 429 when they don't: wait (as long as it
 * says, or 5, 10, 20 s) and try again, up to 3 times.
 */
async function wikiFetch(url: string, timeoutMs = 15_000): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 429 && res.status !== 503) return res;
    if (attempt >= 3) return res;
    const wait = Number(res.headers.get("retry-after"));
    await pause(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 60) * 1000 : 5000 * 2 ** attempt);
  }
}

async function searchCommons(query: string): Promise<Picture[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime|size",
    iiurlwidth: "900",
  });
  const res = await wikiFetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Wikimedia search failed (${res.status})`);
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          index?: number;
          imageinfo?: Array<{
            thumburl?: string;
            mime?: string;
            width?: number;
            extmetadata?: Record<string, { value?: string }>;
          }>;
        }
      >;
    };
  };
  const strip = (h?: string) => (h ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const ii = p.imageinfo?.[0];
      const m = ii?.extmetadata ?? {};
      const licence = strip(m.LicenseShortName?.value);
      if (!ii?.thumburl || !/^image\/(jpeg|png|webp)$/.test(ii.mime ?? "") || (ii.width ?? 0) < 300 || !isFreeLicence(licence)) return [];
      return [{ title: p.title.replace(/^File:/, ""), thumb: ii.thumburl, licence, artist: m.Artist?.value ?? "", description: strip(m.ImageDescription?.value).slice(0, 120) }];
    })
    .slice(0, 5);
}

const PLAN_SYSTEM = `You choose up to ${MAX_PICTURES} talk steps of a lesson that should show a real picture on the board, and what to search for on Wikimedia Commons.
Return only JSON: {"pictures": [{"step": "s2", "query": "search words"}]}
- Pick steps about something you can photograph or that has a famous image: a person, place, building, object, organism, historic painting, document, or a labelled diagram.
- "query": 2 to 5 English words naming it exactly, e.g. "Storming of the Bastille", "human heart diagram", "B. R. Ambedkar".
- Skip abstract steps (definitions, lists of ideas). Different steps must get different pictures.`;

const CHOOSE_SYSTEM = `For each picture slot, pick the file that best shows exactly what the lesson step is about, for school students.
Return only JSON: {"choices": [{"step": "s2", "pick": 1}]} - "pick" is the file's number, or 0 if none clearly fits (wrong subject, a different person, a statue when a portrait is wanted is fine, a map when a portrait is wanted is not).`;

export interface AddedPicture {
  stepId: string;
  title: string;
  credit: string;
}

export async function addPictures(lessonId: string, req: LessonRequest, track: Track, log: (text: string) => void): Promise<AddedPicture[]> {
  const draft = await loadDraft(lessonId);
  if (!draft) return [];
  const lesson = draft.lesson;
  const title = lesson.locales.en?.title ?? lessonId;
  const plan = (await askJson(
    [
      { role: "system", content: PLAN_SYSTEM },
      { role: "user", content: `Lesson: ${title}${req.subject ? ` (${req.subject})` : ""}\nTalk steps:\n${stepList(lesson)}` },
    ],
    { model: "sarvam-105b-conversations", maxTokens: 500, temperature: 0.2 },
    track,
  )) as { pictures?: Array<{ step?: unknown; query?: unknown }> };
  const talk = new Set(lesson.steps.filter((s) => s.type === "say" && !s.image).map((s) => s.id));
  const slots = (plan.pictures ?? [])
    .filter((p): p is { step: string; query: string } => typeof p.step === "string" && talk.has(p.step) && typeof p.query === "string" && !!p.query.trim())
    .filter((p, i, all) => all.findIndex((q) => q.step === p.step) === i)
    .slice(0, MAX_PICTURES);
  if (slots.length === 0) return [];

  // Search each slot (gently: Wikimedia asks clients not to hammer the API).
  const found: Array<{ step: string; query: string; pictures: Picture[] }> = [];
  for (const slot of slots) {
    try {
      found.push({ ...slot, pictures: await searchCommons(slot.query) });
    } catch (err) {
      log(`Picture search for "${slot.query}" failed: ${(err as Error).message}`);
    }
    await pause(1500);
  }
  const withResults = found.filter((f) => f.pictures.length > 0);
  if (withResults.length === 0) return [];

  const en = lesson.locales.en?.steps ?? {};
  const choice = (await askJson(
    [
      { role: "system", content: CHOOSE_SYSTEM },
      {
        role: "user",
        content: withResults
          .map((f) =>
            [
              `Slot ${f.step}: "${(en[f.step]?.text ?? "").slice(0, 160)}" (searched: ${f.query})`,
              ...f.pictures.map((p, i) => `  ${i + 1}. ${p.title}${p.description ? ` - ${p.description}` : ""}`),
            ].join("\n"),
          )
          .join("\n\n"),
      },
    ],
    { model: "sarvam-105b-conversations", maxTokens: 400, temperature: 0.1 },
    track,
  )) as { choices?: Array<{ step?: unknown; pick?: unknown }> };

  const added: AddedPicture[] = [];
  for (const f of withResults) {
    const c = (choice.choices ?? []).find((x) => x.step === f.step);
    const index = pickedIndex(c?.pick, f.pictures.length);
    if (index === null) continue;
    const pic = f.pictures[index]!;
    try {
      const res = await wikiFetch(pic.thumb);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const data = new Uint8Array(await res.arrayBuffer());
      // The real type, from the first bytes (a thumbnail's name doesn't always match its format).
      const ext = data[0] === 0x89 ? "png" : data[0] === 0x52 ? "webp" : "jpg";
      const { kind, ext: realExt } = checkUpload(`picture.${ext}`, data);
      if (kind !== "image") throw new Error("not an image");
      const src = await saveUpload(lessonId, `pic-${f.step}`, realExt, data);
      const credit = pictureCredit(pic.artist, pic.licence);
      await updateDraft(lessonId, (l) => setStepImage(l, f.step, { src, credit }));
      added.push({ stepId: f.step, title: pic.title, credit });
    } catch (err) {
      log(`Couldn't add the picture "${pic.title}": ${(err as Error).message}`);
    }
    await pause(1500);
  }
  return added;
}
