"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * One video surface for the classroom board and the admin cue editor: an uploaded file (<video>)
 * or a YouTube video (IFrame Player API, youtube-nocookie.com). Both are muted (the teacher
 * narrates) and controlled the same way, so cues seek/play/pause identically for either source.
 */

export type BoardSource = { kind: "upload"; src: string; poster?: string } | { kind: "youtube"; videoId: string };

export interface MediaControl {
  currentTime(): number;
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  paused(): boolean;
  /** Seconds, or null while unknown. */
  duration(): number | null;
}

export interface SurfaceProps {
  source: BoardSource;
  /** Appended to an upload's URL to skip a stale cached file after a re-upload. */
  version?: string;
  /**
   * Called when the video can be controlled, with the picture size for placing the pointer (the
   * video's pixels, or 16:9 for YouTube). Uploads call it again once the real size is known, and
   * after a WebM duration scan: callers should re-apply the current cue each time.
   */
  onReady: (control: MediaControl, size: { w: number; h: number }) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** e.g. "youtube-150" (embedding disabled), "youtube-100" (removed/private), "upload-4" (can't decode). */
  onError?: (code: string) => void;
  onDurationChange?: (seconds: number) => void;
  label?: string;
}

export function MediaSurface(props: SurfaceProps) {
  return props.source.kind === "youtube" ? (
    <YouTubeSurface key={props.source.videoId} {...props} videoId={props.source.videoId} />
  ) : (
    <UploadSurface {...props} src={props.source.src} poster={props.source.poster} />
  );
}

/* ---------------------------------------------------------------------------------------- */

function UploadSurface({
  src,
  poster,
  version,
  onReady,
  onPlayingChange,
  onError,
  onDurationChange,
  label,
}: SurfaceProps & { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const url = version ? `${src}${src.includes("?") ? "&" : "?"}v=${version}` : src;

  function ready() {
    const v = ref.current;
    if (!v) return;
    // Control is handed over at once, before the video has loaded anything: phone browsers often
    // don't preload video (data saver, mobile data) and only start loading when play() is called.
    const control: MediaControl = {
      currentTime: () => v.currentTime,
      seek: (t) => {
        v.currentTime = t;
      },
      play: () => void v.play().catch(() => {}),
      pause: () => v.pause(),
      paused: () => v.paused,
      duration: () => (Number.isFinite(v.duration) ? v.duration : null),
    };
    onReady(control, { w: v.videoWidth || 16, h: v.videoHeight || 9 });
  }

  // Ready to control as soon as the element exists (re-called with the real size after metadata).
  useLayoutEffect(() => {
    ready();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per element/source
  }, [url]);

  function onLoadedMetadata() {
    const v = ref.current;
    if (!v) return;
    if (!Number.isFinite(v.duration)) {
      // Browser-recorded WebM has no duration or seek index, so seeking fails. Asking for a far-off
      // time makes the browser scan the file once and learn its duration; then report ready.
      const restore = () => {
        v.removeEventListener("durationchange", restore);
        v.currentTime = 0;
        ready();
      };
      v.addEventListener("durationchange", restore);
      v.currentTime = 1e6;
      return;
    }
    ready();
  }

  return (
    <video
      ref={ref}
      className="board-video"
      src={url}
      poster={poster}
      muted
      playsInline
      preload="auto"
      aria-label={label}
      onLoadedMetadata={onLoadedMetadata}
      onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && onDurationChange?.(e.currentTarget.duration)}
      onPlay={() => onPlayingChange?.(true)}
      onPause={() => onPlayingChange?.(false)}
      onError={(e) => onError?.(`upload-${e.currentTarget.error?.code ?? 0}`)}
    />
  );
}

/* ---------------------------------------------------------------------------------------- */

/** The parts of the YouTube IFrame Player API we use. */
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the YouTube player script once, only when a lesson actually shows a YouTube video. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube could not be loaded"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

function YouTubeSurface({ videoId, onReady, onPlayingChange, onError, onDurationChange }: SurfaceProps & { videoId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Latest callbacks, without re-creating the player.
  const cb = useRef({ onReady, onPlayingChange, onError, onDurationChange });
  cb.current = { onReady, onPlayingChange, onError, onDurationChange };

  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    const mount = document.createElement("div");
    hostRef.current?.appendChild(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            mute: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              const p = e.target;
              p.mute();
              const control: MediaControl = {
                currentTime: () => p.getCurrentTime() || 0,
                seek: (t) => p.seekTo(t, true),
                play: () => p.playVideo(),
                pause: () => p.pauseVideo(),
                paused: () => p.getPlayerState() !== PLAYING,
                duration: () => p.getDuration() || null,
              };
              const d = p.getDuration();
              if (d) cb.current.onDurationChange?.(d);
              cb.current.onReady(control, { w: 16, h: 9 });
            },
            onStateChange: (e) => {
              cb.current.onPlayingChange?.(e.data === PLAYING);
              const d = e.target.getDuration();
              if (d) cb.current.onDurationChange?.(d);
            },
            // 2 bad id, 5 HTML5 error, 100 removed/private, 101/150 owner blocked embedding.
            onError: (e) => cb.current.onError?.(`youtube-${e.data}`),
          },
        });
      })
      .catch(() => cb.current.onError?.("youtube-script"));
    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      mount.remove();
    };
  }, [videoId]);

  // A 16:9 box centred in the frame: the same picture area the admin marks points on,
  // whatever shape the board is on this screen.
  return <div className="yt-surface" ref={hostRef} aria-hidden />;
}

export { mediaErrorMessage } from "../lib/mediaErrors";
