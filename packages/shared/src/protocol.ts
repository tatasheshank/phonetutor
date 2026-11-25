import type { LanguageCode, SpeechRate } from "./languages";

/**
 * Data-channel messages between the phone and the agent worker.
 * Sent as JSON on the "tutor" topic.
 */
export const DATA_TOPIC = "tutor";

export type AvatarState = "neutral" | "smile" | "listening" | "thinking" | "speaking";

/** Agent -> phone */
export type AgentEvent =
  | { type: "show_screen"; screen: string }
  | { type: "highlight"; target: string | null }
  /** The teacher presses `target` on the demo phone: it animates the press and moves to the next screen. */
  | { type: "tap"; target: string }
  | { type: "avatar_state"; state: AvatarState }
  | { type: "caption"; text: string; final: boolean }
  | { type: "resume"; stepId: string }
  // Lesson player
  | { type: "lesson_start"; lessonId: string; title: string; total: number }
  | { type: "progress"; index: number; total: number }
  /** A quick question; `options` are answer keys the phone shows as buttons (e.g. "yes", "no"). */
  | { type: "check"; stepId: string; question: string; options: string[] }
  | { type: "check_done"; stepId: string }
  | { type: "lesson_done" }
  // Classroom board: a video the teacher plays and points at.
  /** Load a board video: an uploaded file, or a YouTube video by id (played muted from youtube-nocookie.com). */
  | { type: "board_video"; stepId: string; source: { kind: "upload"; src: string; poster?: string } | { kind: "youtube"; videoId: string } }
  /**
   * One narrated segment: the phone seeks to `at`, plays until `until` (next cue, or the end when
   * null), and pauses there if `pause`. `point` / `highlightBox` are fractions of the video frame.
   * Re-sent when the teacher repeats a segment after a question.
   */
  | {
      type: "board_cue";
      stepId: string;
      index: number;
      at: number;
      until: number | null;
      pause: boolean;
      point: { x: number; y: number } | null;
      highlightBox: { x: number; y: number; w: number; h: number } | null;
      caption: string | null;
    }
  | { type: "board_done"; stepId: string }
  /**
   * The live (talking video) teacher: "starting" while the service joins, "ready" once its video
   * is in the room, "failed" if it couldn't start (the lesson goes on with the voice and the
   * learner's other look).
   */
  | { type: "live_avatar"; status: "starting" | "ready" | "failed" };

/** Phone -> agent */
export type ClientEvent =
  | { type: "ask_pressed" }
  | { type: "tap_answer"; value: string }
  | { type: "check_answer"; stepId: string; value: string };

/** Metadata the web app puts on the participant token so the agent knows the learner's settings. */
export interface ParticipantSettings {
  /** Signed-in user's ID (see learner.ts). */
  learnerId?: string;
  tutorLanguage: LanguageCode;
  screenLanguage: LanguageCode;
  endpointingMs?: number;
  /** Topic the learner picked (see topics.ts): free conversation stays on it. */
  topic?: string;
  /** Scripted lesson to run. Absent = free conversation with the tutor. */
  lessonId?: string;
  /** Voice the learner picked (VoiceOption id for the tutor language). Absent = language default. */
  voiceId?: string;
  /** Speaking speed the learner picked. Absent = "normal". */
  speechRate?: SpeechRate;
  /** The learner chose the live (talking video) teacher. Used only if the admin set one up. */
  liveAvatar?: boolean;
}

export function encodeEvent(event: AgentEvent | ClientEvent): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(event));
}

export function decodeEvent<T extends AgentEvent | ClientEvent>(payload: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    return null;
  }
}
