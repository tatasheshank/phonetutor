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
      <h2>Add video clips</h2>
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
      {status && <p className="small" style={{ whiteSpace: "pre-line" }}>{status}</p>}
    </section>
  );
}
