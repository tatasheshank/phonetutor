import "server-only";
import {
  appendVideoStep,
  cueTimes,
  parseIsoDuration,
  pickedIndex,
  placeStepAfter,
  setVideoCues,
  type Lesson,
} from "@ai-tutor/shared";
import { loadDraft, updateDraft } from "../lessonDrafts";
import { askJson, translateLines } from "../lessonGenerator";
import type { LessonRequest, Track } from "./ai";

/**
 * Lesson Assistant: finds YouTube videos for a lesson and adds them with the teacher's narration.
 * Search uses the YouTube Data API (free key, YOUTUBE_API_KEY; about 100 searches a day free).
 * The AI never sees the video itself, only titles and descriptions, so the admin must watch each one.
 */

const MAX_VIDEOS = 2;
const INTRO = "Now let us watch a short video.";

interface Candidate {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  seconds: number | null;
}

export class YouTubeKeyMissing extends Error {}

/** Talk steps as "s3: text" lines, for the AI to choose where things go. */
export function stepList(lesson: Lesson, max = 400): string {
  const en = lesson.locales.en;
  return lesson.steps
    .filter((s) => s.type === "say")
    .map((s) => `${s.id}: ${(en?.steps[s.id]?.text ?? "").slice(0, 160)}`)
    .join("\n")
    .slice(0, max * 10);
}

async function youtube(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new YouTubeKeyMissing("YOUTUBE_API_KEY is not set");
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function search(query: string): Promise<Candidate[]> {
  const found = (await youtube("search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults: "6",
    videoEmbeddable: "true",
    safeSearch: "strict",
    regionCode: "IN",
  })) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; description?: string; liveBroadcastContent?: string } }> };
  const items = (found.items ?? []).filter((i) => i.id?.videoId && i.snippet?.liveBroadcastContent !== "live");
  if (items.length === 0) return [];
  const details = (await youtube("videos", { part: "contentDetails,status", id: items.map((i) => i.id!.videoId!).join(",") })) as {
    items?: Array<{ id: string; contentDetails?: { duration?: string }; status?: { embeddable?: boolean; privacyStatus?: string } }>;
  };
  const byId = new Map((details.items ?? []).map((d) => [d.id, d]));
  return items.flatMap((i) => {
    const d = byId.get(i.id!.videoId!);
    const seconds = parseIsoDuration(d?.contentDetails?.duration);
    // Embeddable, public, and 30 s to 25 min long.
    if (!d || d.status?.embeddable === false || d.status?.privacyStatus !== "public") return [];
    if (seconds !== null && (seconds < 30 || seconds > 25 * 60)) return [];
    const decode = (t?: string) => (t ?? "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return [{ videoId: i.id!.videoId!, title: decode(i.snippet?.title), channel: decode(i.snippet?.channelTitle), description: decode(i.snippet?.description).slice(0, 160), seconds }];
  });
}

/** YouTube's public oEmbed: confirms the video can be shown inside other apps. */
async function embeddable(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const QUERY_SYSTEM = `You choose where short YouTube videos would help in a spoken lesson, and what to search for.
Return only JSON: {"videos": [{"after": "s3", "query": "search words"}]} with 0 to ${MAX_VIDEOS} videos.
- "after": the id of the talk step the video should follow (the step that introduces the topic the video shows).
- "query": 3 to 8 search words for an educational, animated explainer for school students, e.g. "photosynthesis animation class 10".
- Only where a moving picture really helps (a process, an event, a place). Never two videos on the same topic.`;

const CHOOSE_SYSTEM = `You pick ONE YouTube video for a lesson from search results, and write what the teacher says while it plays (the video is muted).
Return only JSON: {"pick": 2, "narration": ["...", "...", "..."]}
- "pick": the number of the best result: educational, on exactly this topic, for school students, from a teaching channel. 0 if none fits (wrong topic, entertainment, news, politics, adverts, other languages' textbooks).
- "narration": 3 short sentences (at most 20 words each) the teacher says over the video, about the TOPIC, using only facts from the lesson text. Do not describe what is on screen; you have not seen the video.`;

export interface AddedVideo {
  videoId: string;
  title: string;
  stepId: string;
}

/**
 * Finds and adds up to two videos to a lesson draft, with narration in all its languages.
 * Returns what was added; notes go to `log` (shown to the admin).
 */
export async function addVideos(lessonId: string, req: LessonRequest, track: Track, log: (text: string) => void): Promise<AddedVideo[]> {
  const draft = await loadDraft(lessonId);
  if (!draft) return [];
  const lesson = draft.lesson;
  const title = lesson.locales.en?.title ?? lessonId;
  const context = [req.level, req.subject, req.board].filter(Boolean).join(", ");

  const plan = (await askJson(
    [
      { role: "system", content: QUERY_SYSTEM },
      { role: "user", content: `Lesson: ${title}${context ? ` (${context})` : ""}\nTalk steps:\n${stepList(lesson)}` },
    ],
    { model: "sarvam-105b-conversations", maxTokens: 500, temperature: 0.2 },
    track,
  )) as { videos?: Array<{ after?: unknown; query?: unknown }> };
  const wanted = (plan.videos ?? [])
    .filter((v) => typeof v.query === "string" && v.query.trim() && typeof v.after === "string")
    .slice(0, MAX_VIDEOS) as Array<{ after: string; query: string }>;

  const added: AddedVideo[] = [];
  const used = new Set(lesson.steps.flatMap((s) => (s.type === "video" && s.source.kind === "youtube" ? [s.source.videoId] : [])));
  for (const want of wanted) {
    const candidates = (await search(want.query)).filter((c) => !used.has(c.videoId));
    if (candidates.length === 0) {
      log(`No suitable video found for "${want.query}".`);
      continue;
    }
    const stepText = lesson.locales.en?.steps[want.after]?.text ?? "";
    const choice = (await askJson(
      [
        { role: "system", content: CHOOSE_SYSTEM },
        {
          role: "user",
          content: [
            `Lesson: ${title}${context ? ` (${context})` : ""}`,
            `The video follows this line: ${stepText}`,
            `Lesson text:\n${stepList(lesson, 200)}`,
            "Search results:",
            ...candidates.map(
              (c, i) => `${i + 1}. "${c.title}" by ${c.channel}${c.seconds ? `, ${Math.round(c.seconds / 60)} min` : ""}. ${c.description}`,
            ),
          ].join("\n"),
        },
      ],
      { model: "sarvam-105b-conversations", maxTokens: 700, temperature: 0.2 },
      track,
    )) as { pick?: unknown; narration?: unknown };
    const index = pickedIndex(choice.pick, candidates.length);
    const narration = (Array.isArray(choice.narration) ? choice.narration : [])
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim())
      .slice(0, 4);
    if (index === null || narration.length === 0) {
      log(`None of the videos for "${want.query}" fitted the lesson.`);
      continue;
    }
    const pick = candidates[index]!;
    if (!(await embeddable(pick.videoId))) {
      log(`"${pick.title}" can't be shown inside the app; skipped.`);
      continue;
    }

    // Narration in every language of the lesson.
    const lines = [INTRO, ...narration];
    const per: Record<string, string[]> = { en: lines };
    for (const lang of ["te", "hi"] as const) {
      if (!lesson.locales[lang]) continue;
      const { lines: out, usage } = await translateLines(lines, lang);
      track(usage);
      per[lang] = out.map((t, i) => t || lines[i]!);
    }
    const times = cueTimes(narration.length, pick.seconds);
    let stepId = "";
    await updateDraft(lessonId, (l) => {
      const appended = appendVideoStep(l, { source: { kind: "youtube", videoId: pick.videoId }, label: pick.title.slice(0, 160) });
      stepId = appended.stepId;
      const withCues = setVideoCues(
        appended.lesson,
        stepId,
        narration.map((_, i) => ({ at: times[i]!, pause: true, text: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v[i + 1]!])) })),
        Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v[0]!])),
      );
      return placeStepAfter(withCues, stepId, want.after);
    });
    used.add(pick.videoId);
    added.push({ videoId: pick.videoId, title: pick.title, stepId });
  }
  return added;
}
