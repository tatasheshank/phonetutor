import "server-only";
import {
  freeMinutesLeft,
  isLiveProviderId,
  LIVE_PROVIDERS,
  LIVE_SAFETY_MINUTES,
  type LiveAvatarConfig,
  type LiveAvatarStatus,
  type LiveUsage,
} from "@ai-tutor/shared";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * How the teacher looks to learners: the illustrated drawing, or a real photo the admin uploads
 * (a person who agreed to it, or an AI-generated face). A talking video avatar can be added later
 * as a third look. Stored in data/teacher/ (persistent, mounted in production).
 */

/** "drawing" is the drawn woman (the original), "man" the drawn man. */
export type TeacherLook = "drawing" | "man" | "photo" | "live";
export const TEACHER_LOOKS: TeacherLook[] = ["drawing", "man", "photo", "live"];

export interface TeacherSettings {
  defaultLook: TeacherLook;
  photo?: { ext: "jpg" | "png" | "webp"; updatedAt: string; consent: string };
  /** The live (talking video) teacher service, if the admin picked one. */
  live?: LiveAvatarConfig;
}

export interface PublicTeacher {
  defaultLook: TeacherLook;
  /** Null when no photo is uploaded (then only the drawing is offered). */
  photoUrl: string | null;
  /** True when a live teacher service is chosen and the tutor has its key. */
  liveAvailable: boolean;
}

export function teacherDir(): string {
  if (process.env.TEACHER_DIR) return resolve(process.env.TEACHER_DIR);
  return resolve(process.cwd(), "../../data/teacher");
}

const settingsPath = () => resolve(/* turbopackIgnore: true */ teacherDir(), "settings.json");
export const photoPath = (ext: string) => resolve(/* turbopackIgnore: true */ teacherDir(), `photo.${ext}`);

export async function loadTeacher(): Promise<TeacherSettings> {
  try {
    const raw = JSON.parse(await readFile(/* turbopackIgnore: true */ settingsPath(), "utf8")) as Partial<TeacherSettings>;
    const look = TEACHER_LOOKS.includes(raw.defaultLook as TeacherLook) ? (raw.defaultLook as TeacherLook) : "drawing";
    const photo = raw.photo && ["jpg", "png", "webp"].includes(raw.photo.ext) ? raw.photo : undefined;
    const live = raw.live && isLiveProviderId(raw.live.provider) ? raw.live : undefined;
    const fallback = look === "photo" && !photo ? "drawing" : look === "live" && !live ? (photo ? "photo" : "drawing") : look;
    return { defaultLook: fallback, ...(photo ? { photo } : {}), ...(live ? { live } : {}) };
  } catch {
    return { defaultLook: "drawing" };
  }
}

async function saveTeacher(s: TeacherSettings): Promise<void> {
  await mkdir(/* turbopackIgnore: true */ teacherDir(), { recursive: true });
  const tmp = `${settingsPath()}.part`;
  await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(s, null, 2), "utf8");
  await rename(/* turbopackIgnore: true */ tmp, settingsPath());
}

/** Which live services the tutor has API keys for (it writes this file when it starts). */
export async function liveStatus(): Promise<LiveAvatarStatus | null> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ resolve(teacherDir(), "live-status.json"), "utf8")) as LiveAvatarStatus;
  } catch {
    return null;
  }
}

/** Free minutes used per service (written by the tutor). */
export async function liveUsage(): Promise<LiveUsage> {
  try {
    const raw = JSON.parse(await readFile(/* turbopackIgnore: true */ resolve(teacherDir(), "live-usage.json"), "utf8")) as LiveUsage;
    return raw && typeof raw.minutes === "object" ? raw : { minutes: {} };
  } catch {
    return { minutes: {} };
  }
}

/** The live teacher can be offered: a service is chosen, the tutor has its key, and free minutes are left. */
export async function liveReady(s: TeacherSettings): Promise<boolean> {
  if (!s.live) return false;
  const status = await liveStatus();
  if (!status?.keys[s.live.provider]) return false;
  return freeMinutesLeft(await liveUsage(), s.live.provider) >= LIVE_SAFETY_MINUTES;
}

export async function setLive(live: LiveAvatarConfig | null): Promise<TeacherSettings> {
  const current = await loadTeacher();
  const next: TeacherSettings = { ...current };
  if (live) next.live = live;
  else delete next.live;
  if (!live && next.defaultLook === "live") next.defaultLook = next.photo ? "photo" : "drawing";
  await saveTeacher(next);
  return next;
}

export const LIVE_SERVICE_IDS = LIVE_PROVIDERS.map((p) => p.id);

export function publicTeacher(s: TeacherSettings, liveAvailable = false): PublicTeacher {
  return {
    defaultLook: s.defaultLook === "live" && !liveAvailable ? (s.photo ? "photo" : "drawing") : s.defaultLook,
    liveAvailable,
    // The version makes phones fetch a replaced photo instead of a cached old one.
    photoUrl: s.photo ? `/api/teacher/photo?v=${Date.parse(s.photo.updatedAt).toString(36)}` : null,
  };
}

export async function savePhoto(data: Uint8Array, ext: "jpg" | "png" | "webp", consent: string): Promise<TeacherSettings> {
  const current = await loadTeacher();
  await mkdir(/* turbopackIgnore: true */ teacherDir(), { recursive: true });
  const tmp = `${photoPath(ext)}.part`;
  await writeFile(/* turbopackIgnore: true */ tmp, data);
  await rename(/* turbopackIgnore: true */ tmp, photoPath(ext));
  if (current.photo && current.photo.ext !== ext) await rm(/* turbopackIgnore: true */ photoPath(current.photo.ext), { force: true });
  const next: TeacherSettings = { ...current, photo: { ext, updatedAt: new Date().toISOString(), consent: consent.slice(0, 200) } };
  await saveTeacher(next);
  return next;
}

export async function removePhoto(): Promise<TeacherSettings> {
  const current = await loadTeacher();
  if (current.photo) await rm(/* turbopackIgnore: true */ photoPath(current.photo.ext), { force: true });
  const next: TeacherSettings = { ...current, defaultLook: current.defaultLook === "photo" ? "drawing" : current.defaultLook };
  delete next.photo;
  await saveTeacher(next);
  return next;
}

export async function setDefaultLook(look: TeacherLook): Promise<TeacherSettings> {
  const current = await loadTeacher();
  const ok = look === "photo" ? !!current.photo : look === "live" ? !!current.live : true;
  const next: TeacherSettings = { ...current, defaultLook: ok ? look : "drawing" };
  await saveTeacher(next);
  return next;
}

/** The current photo file and its size, or null. */
export async function photoFile(): Promise<{ path: string; ext: string; size: number; mtime: Date } | null> {
  const s = await loadTeacher();
  if (!s.photo) return null;
  try {
    const st = await stat(/* turbopackIgnore: true */ photoPath(s.photo.ext));
    return { path: photoPath(s.photo.ext), ext: s.photo.ext, size: st.size, mtime: st.mtime };
  } catch {
    return null;
  }
}
