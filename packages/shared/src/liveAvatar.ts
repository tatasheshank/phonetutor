/**
 * Live (talking video) teacher: a service renders a lifelike face whose lips move with the tutor's
 * voice, and publishes it into the lesson room.
 *
 * FREE ONLY: only services with a free allowance are listed, and the tutor stops using the live
 * teacher before that allowance runs out (see freeMinutesFor / LIVE_SAFETY_MINUTES), so it never
 * costs money. Off unless the admin picks a service and the tutor has that service's API key.
 *
 * Shared by the tutor (to start it and count minutes) and the admin page (to explain the choices).
 * Free allowances are approximate (November 2026); check each service's pricing page.
 */

export type LiveProviderId = "bey" | "tavus";

export interface LiveProvider {
  id: LiveProviderId;
  name: string;
  /** Environment variable in apps/agent/.env that holds the API key. */
  keyEnv: string;
  /** What the admin pastes to pick a face, in that service's words. */
  avatarIdLabel: string;
  /** Free minutes the tutor allows itself per calendar month (kept a little under the service's allowance). */
  freeMinutesPerMonth: number;
  /** True when the free minutes are a one-time trial rather than monthly. */
  trialOnly: boolean;
  /** What the free tier includes, in plain words, including its catches. */
  freeTier: string;
  signUpUrl: string;
}

export const LIVE_PROVIDERS: LiveProvider[] = [
  {
    id: "tavus",
    name: "Tavus",
    keyEnv: "TAVUS_API_KEY",
    avatarIdLabel: "Face (replica) ID (blank = a stock face)",
    freeMinutesPerMonth: 18,
    trialOnly: false,
    freeTier: "About 20–25 free minutes every month, with stock faces.",
    signUpUrl: "https://platform.tavus.io",
  },
  {
    id: "bey",
    name: "Beyond Presence",
    keyEnv: "BEY_API_KEY",
    avatarIdLabel: "Avatar ID (blank = a stock avatar)",
    freeMinutesPerMonth: 15,
    trialOnly: true,
    freeTier: "A one-time free trial of about 20 minutes, then paid only.",
    signUpUrl: "https://app.bey.chat",
  },
];

/** The live teacher isn't started with fewer free minutes left than this (a lesson needs a few). */
export const LIVE_SAFETY_MINUTES = 3;

export function isLiveProviderId(v: unknown): v is LiveProviderId {
  return typeof v === "string" && LIVE_PROVIDERS.some((p) => p.id === v);
}

export function liveProvider(id: LiveProviderId): LiveProvider {
  return LIVE_PROVIDERS.find((p) => p.id === id)!;
}

/** Calendar month key, e.g. "2026-11" (India time), for counting free minutes. */
export function liveMonthKey(date = new Date()): string {
  const ist = new Date(date.getTime() + 5.5 * 3600_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Minutes used per service: monthly services count this month; trial services count forever. */
export interface LiveUsage {
  /** e.g. { "tavus": { "2026-11": 12.5 }, "bey": { "trial": 4 } } */
  minutes: Partial<Record<LiveProviderId, Record<string, number>>>;
}

export function liveUsageKey(p: LiveProvider, date = new Date()): string {
  return p.trialOnly ? "trial" : liveMonthKey(date);
}

/** Free minutes still available for a service (never negative). */
export function freeMinutesLeft(usage: LiveUsage, id: LiveProviderId, date = new Date()): number {
  const p = liveProvider(id);
  const used = usage.minutes[id]?.[liveUsageKey(p, date)] ?? 0;
  return Math.max(0, p.freeMinutesPerMonth - used);
}

/** The admin's choice, kept in data/teacher/settings.json under "live". */
export interface LiveAvatarConfig {
  provider: LiveProviderId;
  /** The service's avatar/face id. Empty = the service's default. */
  avatarId?: string;
}

/** Which services the running tutor has keys for (written by the tutor at start, read by the admin page). */
export interface LiveAvatarStatus {
  checkedAt: string;
  keys: Record<LiveProviderId, boolean>;
}
