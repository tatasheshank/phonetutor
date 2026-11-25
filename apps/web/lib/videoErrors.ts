import "server-only";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Broken lesson videos reported by players (YouTube removed/private/embedding blocked, or an
 * upload that won't decode). Kept in data/video-errors.jsonl so the admin pages can flag them.
 * Learners' browsers can report, so input is validated, repeats are dropped, and the file is capped.
 */

export interface VideoErrorReport {
  at: string;
  lessonId: string;
  stepId: string;
  code: string;
}

const MAX_FILE_BYTES = 1024 * 1024;
const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number>();

export function videoErrorsPath(): string {
  if (process.env.VIDEO_ERRORS_PATH) return resolve(process.env.VIDEO_ERRORS_PATH);
  return resolve(process.cwd(), "../../data/video-errors.jsonl");
}

export function isValidReport(r: { lessonId?: unknown; stepId?: unknown; code?: unknown }): r is { lessonId: string; stepId: string; code: string } {
  return (
    typeof r.lessonId === "string" &&
    /^[a-z0-9-]{1,80}$/.test(r.lessonId) &&
    typeof r.stepId === "string" &&
    /^[a-z0-9_-]{1,40}$/i.test(r.stepId) &&
    typeof r.code === "string" &&
    /^(youtube|upload)-[a-z0-9]{1,10}$/.test(r.code)
  );
}

/** Records a report unless the same one came in the last 10 minutes. Returns whether it was written. */
export async function recordVideoError(r: { lessonId: string; stepId: string; code: string }): Promise<boolean> {
  const key = `${r.lessonId}|${r.stepId}|${r.code}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - REPEAT_WINDOW_MS) return false;
  recent.set(key, now);
  if (recent.size > 2000) recent.clear();

  const path = videoErrorsPath();
  try {
    if ((await stat(/* turbopackIgnore: true */ path)).size > MAX_FILE_BYTES) return false;
  } catch {
    await mkdir(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  }
  const line: VideoErrorReport = { at: new Date(now).toISOString(), ...r };
  await appendFile(/* turbopackIgnore: true */ path, JSON.stringify(line) + "\n", "utf8");
  console.warn(`[video] ${r.lessonId}/${r.stepId}: ${r.code}`);
  return true;
}

/** Reports from the last `days` days, newest first. */
export async function recentVideoErrors(days = 14): Promise<VideoErrorReport[]> {
  let raw = "";
  try {
    raw = await readFile(/* turbopackIgnore: true */ videoErrorsPath(), "utf8");
  } catch {
    return [];
  }
  const since = Date.now() - days * 86_400_000;
  return raw
    .split("\n")
    .flatMap((l) => {
      try {
        const r = JSON.parse(l) as VideoErrorReport;
        return isValidReport(r) && Date.parse(r.at) >= since ? [r] : [];
      } catch {
        return [];
      }
    })
    .reverse();
}
