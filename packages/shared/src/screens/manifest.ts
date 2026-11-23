/**
 * Screen library manifest. Every simulated practice screen and every tappable
 * target it exposes. The lesson validator and the generated-mode LLM prompt
 * both read this list, so a lesson can never point at a button that does not exist.
 *
 * Target ids are stable across screen languages; only the visible labels change.
 */
export const SCREEN_MANIFEST = {
  "wa.chats": {
    description: "WhatsApp chat list",
    targets: ["row.beta", "row.family", "btn.newChat", "tab.calls"],
  },
  "wa.chat": {
    description: "WhatsApp chat with one person",
    targets: ["btn.back", "btn.videoCall", "btn.voiceCall", "input.message", "btn.send", "btn.mic"],
  },
  "wa.call": {
    description: "WhatsApp video call in progress",
    targets: ["btn.endCall", "btn.switchCamera", "btn.mute", "btn.cameraOff"],
  },
} as const satisfies Record<string, { description: string; targets: readonly string[] }>;

export type ScreenId = keyof typeof SCREEN_MANIFEST;

/**
 * Where a tap leads, like in the real app. Used when the learner explores the screen freely
 * (outside a graded practice step). Targets not listed here just give tap feedback.
 */
export const SCREEN_NAV: Partial<Record<ScreenId, Record<string, ScreenId>>> = {
  "wa.chats": { "row.beta": "wa.chat", "row.family": "wa.chat" },
  "wa.chat": { "btn.back": "wa.chats", "btn.videoCall": "wa.call", "btn.voiceCall": "wa.call" },
  "wa.call": { "btn.endCall": "wa.chat" },
};

/** The screen a tap leads to, or null if it stays put. */
export function nextScreen(screen: string, target: string): ScreenId | null {
  return isScreenId(screen) ? (SCREEN_NAV[screen]?.[target] ?? null) : null;
}

export function isScreenId(id: string): id is ScreenId {
  return Object.hasOwn(SCREEN_MANIFEST, id);
}

export function screenHasTarget(screen: string, target: string): boolean {
  if (!isScreenId(screen)) return false;
  return (SCREEN_MANIFEST[screen].targets as readonly string[]).includes(target);
}
