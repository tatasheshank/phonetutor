"use client";

/** Tells the server a lesson video couldn't play, so the admin dashboard can flag it. Best effort. */
export function reportVideoError(lessonId: string, stepId: string, code: string): void {
  void fetch("/api/video-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lessonId, stepId, code }),
    keepalive: true,
  }).catch(() => {});
}
