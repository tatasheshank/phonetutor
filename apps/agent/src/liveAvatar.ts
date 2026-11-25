import {
  freeMinutesLeft,
  isLiveProviderId,
  LIVE_PROVIDERS,
  LIVE_SAFETY_MINUTES,
  liveProvider,
  liveUsageKey,
  type LiveAvatarConfig,
  type LiveAvatarStatus,
  type LiveProviderId,
  type LiveUsage,
} from "@ai-tutor/shared";
import type { voice } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Live (talking video) teacher, FREE ONLY. The admin picks a service on the Teacher page (saved in
 * data/teacher/settings.json); its API key lives only here, in apps/agent/.env. Minutes are counted
 * in data/teacher/live-usage.json and the live teacher is never used beyond the service's free
 * allowance. If anything goes wrong the lesson carries on with the voice alone: the learner's
 * phone falls back to the drawing or photo.
 */

export function teacherDir(): string {
  if (process.env.TEACHER_DIR) return resolve(process.env.TEACHER_DIR);
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/teacher");
}

const hasKey = (id: LiveProviderId) => (process.env[liveProvider(id).keyEnv] ?? "").trim().length > 8;

/** Tells the admin page which live-teacher services have keys here (never the keys themselves). */
export async function writeLiveStatus(): Promise<void> {
  const status: LiveAvatarStatus = {
    checkedAt: new Date().toISOString(),
    keys: Object.fromEntries(LIVE_PROVIDERS.map((p) => [p.id, hasKey(p.id)])) as LiveAvatarStatus["keys"],
  };
  try {
    await mkdir(teacherDir(), { recursive: true });
    await writeFile(resolve(teacherDir(), "live-status.json"), JSON.stringify(status, null, 2), "utf8");
  } catch (err) {
    console.warn("[live-avatar] couldn't write status", err);
  }
}

/* ---- Free-minute accounting ---- */

const usagePath = () => resolve(teacherDir(), "live-usage.json");

export async function readLiveUsage(): Promise<LiveUsage> {
  try {
    const raw = JSON.parse(await readFile(usagePath(), "utf8")) as LiveUsage;
    return raw && typeof raw.minutes === "object" ? raw : { minutes: {} };
  } catch {
    return { minutes: {} };
  }
}

/** Adds minutes to this month's (or the trial's) count for a service. */
export async function addLiveMinutes(id: LiveProviderId, minutes: number): Promise<void> {
  if (!(minutes > 0)) return;
  const usage = await readLiveUsage();
  const key = liveUsageKey(liveProvider(id));
  const forProvider = (usage.minutes[id] ??= {});
  forProvider[key] = Math.round(((forProvider[key] ?? 0) + minutes) * 100) / 100;
  await mkdir(teacherDir(), { recursive: true });
  const tmp = `${usagePath()}.part`;
  await writeFile(tmp, JSON.stringify(usage, null, 2), "utf8");
  await rename(tmp, usagePath());
}

/* ---- Choosing and starting ---- */

interface TeacherFile {
  live?: Partial<LiveAvatarConfig>;
}

export type LiveDecision =
  | { ok: true; config: LiveAvatarConfig; minutesLeft: number }
  | { ok: false; reason: "not set up" | "no key" | "free minutes used up" };

/** Whether the live teacher can be used now: set up, has a key, and has free minutes left. */
export async function liveConfig(): Promise<LiveDecision> {
  let file: TeacherFile;
  try {
    file = JSON.parse(await readFile(resolve(teacherDir(), "settings.json"), "utf8")) as TeacherFile;
  } catch {
    return { ok: false, reason: "not set up" };
  }
  const live = file.live;
  if (!live || !isLiveProviderId(live.provider)) return { ok: false, reason: "not set up" };
  if (!hasKey(live.provider)) return { ok: false, reason: "no key" };
  const minutesLeft = freeMinutesLeft(await readLiveUsage(), live.provider);
  if (minutesLeft < LIVE_SAFETY_MINUTES) return { ok: false, reason: "free minutes used up" };
  const avatarId = typeof live.avatarId === "string" && /^[\w.:-]{1,120}$/.test(live.avatarId.trim()) ? live.avatarId.trim() : undefined;
  return { ok: true, config: { provider: live.provider, ...(avatarId ? { avatarId } : {}) }, minutesLeft };
}

/**
 * Starts the chosen service's avatar in the room. Must run BEFORE session.start(), so the tutor's
 * voice is routed to the avatar (which then plays it, lip-synced). Resolves once the avatar's
 * video is in the room, or throws (and gives the voice back to the room).
 */
export async function startLiveAvatar(session: voice.AgentSession, room: Room, config: LiveAvatarConfig, timeoutMs = 20_000): Promise<voice.AvatarSession> {
  let avatar: voice.AvatarSession;
  switch (config.provider) {
    case "bey": {
      const { AvatarSession } = await import("@livekit/agents-plugin-bey");
      avatar = new AvatarSession({ ...(config.avatarId ? { avatarId: config.avatarId } : {}) });
      break;
    }
    case "tavus": {
      const { AvatarSession } = await import("@livekit/agents-plugin-tavus");
      avatar = new AvatarSession({ ...(config.avatarId ? { faceId: config.avatarId } : {}) });
      break;
    }
  }
  const started = Date.now();
  try {
    await withTimeout(avatar.start(session, room), timeoutMs, "starting the live teacher");
    await avatar.waitForJoin({ timeout: Math.max(1000, timeoutMs - (Date.now() - started)) });
    return avatar;
  } catch (err) {
    // The avatar may already have taken over the tutor's audio: give it back, or the learner hears nothing.
    try {
      await avatar.aclose();
    } catch {
      /* already closed */
    }
    session.output.audio = null;
    throw err;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((ok, fail) => {
    const t = setTimeout(() => fail(new Error(`timed out ${what}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      (e) => {
        clearTimeout(t);
        fail(e);
      },
    );
  });
}
