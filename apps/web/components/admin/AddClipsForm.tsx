"use client";

import { byClipName, MAX_CLIP_BYTES } from "@ai-tutor/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadClip } from "./uploadClip";

/**
 * Adds screen-recording clips to a lesson: each becomes a board video step (before the final
 * question), in file-name order. Uploads one at a time with progress.
 */
export function AddClipsForm({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");

  async function addYouTube() {
    setBusy(true);
    setStatus("Checking the YouTube video…");
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}/youtube`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string | null; warning?: string | null };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setYoutubeUrl("");
      setStatus(data.warning ?? `Added "${data.title ?? "YouTube video"}". Set its cues and narration in its editor.`);
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function add(list: FileList | null) {
    const files = [...(list ?? [])].sort((a, b) => byClipName(a.name, b.name));
    if (!files.length) return;
    setBusy(true);
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      if (f.size > MAX_CLIP_BYTES) {
        failed.push(`${f.name}: over 50 MB`);
        continue;
      }
      try {
        await uploadClip(lessonId, f, {}, (p) => setStatus(`Uploading ${i + 1} of ${files.length}: ${f.name} (${p}%)`));
      } catch (err) {
        failed.push(`${f.name}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    setStatus(failed.length ? `Some clips failed:\n${failed.join("\n")}` : `Added ${files.length} clip(s). Write the narration in each one's editor.`);
    router.refresh();
  }

  return (
    <section className="card stack">
      <h2>Add videos</h2>
      <p className="muted small">
        MP4 or WebM, up to 50 MB each. Choose several at once: they are added in file-name order (01, 02, …), before the final question.
      </p>
      <input
        className="input"
        type="file"
        multiple
        accept=".mp4,.webm,video/mp4,video/webm"
        disabled={busy}
        onChange={(e) => {
          void add(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <div className="field">
        <span>Or add a YouTube video (instead of uploading)</span>
        <div className="row yt-row">
          <input
            className="input"
            type="url"
            placeholder="https://youtu.be/…  or  https://www.youtube.com/watch?v=…"
            value={youtubeUrl}
            disabled={busy}
            onChange={(e) => setYoutubeUrl(e.currentTarget.value)}
          />
          <button type="button" className="btn secondary" disabled={busy || !youtubeUrl.trim()} onClick={() => void addYouTube()}>
            Add
          </button>
        </div>
      </div>
      <p className="small muted yt-note">
        Use your own YouTube videos, ideally <strong>unlisted</strong> (private videos can&apos;t be shown). It plays muted, from YouTube&apos;s
        privacy-enhanced player, and learners can&apos;t tap through to YouTube. YouTube may still show ads, and the owner can remove a video at
        any time, so upload clips for core lessons. If a video stops working, this page flags it and learners hear the narration without it.
      </p>
      {status && <p className="small" style={{ whiteSpace: "pre-line" }}>{status}</p>}
    </section>
  );
}
