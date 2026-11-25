"use client";

import type { AvatarState } from "@ai-tutor/shared";
import type { RemoteTrack } from "livekit-client";
import { useEffect, useRef } from "react";

/**
 * The live (talking video) teacher: the avatar service's video, in the same round frame as the
 * drawn and photo teachers, with the same listening/thinking ring. Muted here: her voice is a
 * separate audio track, already playing (lip-synced by the service).
 */
export function LiveTeacher({ track, state, small = false }: { track: RemoteTrack; state: AvatarState; small?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  const ring = state === "listening" ? "var(--primary)" : state === "thinking" ? "var(--accent)" : "transparent";
  return (
    <div className={`live-teacher${small ? " small" : ""}`} style={{ boxShadow: `0 0 0 5px ${ring}` }} aria-hidden>
      <video ref={ref} autoPlay playsInline muted />
    </div>
  );
}
