"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "../Avatar";

type Look = "drawing" | "man" | "photo";

/**
 * Admin: the teacher's look. Upload a photo (shrunk in the browser so phones load it fast),
 * confirm consent, preview both looks, and choose the default for learners.
 */
export function TeacherSettings({ initial }: { initial: { defaultLook: Look; photoUrl: string | null } }) {
  const router = useRouter();
  const [teacher, setTeacher] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const speaking = useRef({ current: 0 });
  const [demo, setDemo] = useState(false);

  async function pick(f: File | undefined) {
    setStatus(null);
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      setStatus("Choose a PNG, JPG or WebP photo.");
      return;
    }
    try {
      const small = await shrink(f, 640);
      setFile(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      setStatus("That photo couldn't be read. Try another one.");
    }
  }

  async function upload() {
    if (!file || !consent) return;
    setBusy(true);
    setStatus("Uploading…");
    try {
      const form = new FormData();
      form.set("photo", file);
      form.set("consent", "yes");
      const res = await fetch("/api/admin/teacher", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string; defaultLook?: Look; photoUrl?: string | null };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setTeacher({ defaultLook: data.defaultLook ?? "drawing", photoUrl: data.photoUrl ?? null });
      setFile(null);
      setPreview(null);
      setConsent(false);
      setStatus("Saved. Learners can now choose the photo teacher.");
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function call(method: "PATCH" | "DELETE", body?: unknown) {
    if (method === "DELETE" && !confirm("Remove the teacher photo? Everyone goes back to the drawn teacher.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/teacher", {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; defaultLook?: Look; photoUrl?: string | null };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setTeacher({ defaultLook: data.defaultLook ?? "drawing", photoUrl: data.photoUrl ?? null });
      setStatus(method === "DELETE" ? "Photo removed." : "Saved.");
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // "Hear her speak" preview: drive the voice level with a simple wave.
  function toggleDemo() {
    if (demo) {
      setDemo(false);
      speaking.current.current = 0;
      return;
    }
    setDemo(true);
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t > 4) {
        speaking.current.current = 0;
        setDemo(false);
        return;
      }
      speaking.current.current = Math.max(0, Math.sin(t * 9) * 0.5 + Math.sin(t * 3.7) * 0.3);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const photoForPreview = preview ?? teacher.photoUrl;

  return (
    <div className="stack">
      <section className="card stack">
        <h2>How learners see the teacher</h2>
        <div className="teacher-looks">
          {(["drawing", "man"] as const).map((l) => (
            <figure key={l}>
              <Avatar state={demo ? "speaking" : "neutral"} level={speaking.current} look={l} />
              <figcaption>
                {l === "man" ? "Man (drawing)" : "Woman (drawing)"} {teacher.defaultLook === l && <span className="live">· default</span>}
                {teacher.defaultLook !== l && (
                  <button className="link-btn" type="button" disabled={busy} onClick={() => void call("PATCH", { defaultLook: l })}>
                    make default
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
          <figure>
            {photoForPreview ? (
              <Avatar state={demo ? "speaking" : "neutral"} level={speaking.current} look="photo" photoUrl={photoForPreview} />
            ) : (
              <div className="teacher-empty">No photo yet</div>
            )}
            <figcaption>
              Photo {preview && <span className="muted">(not saved yet)</span>}
              {!preview && teacher.photoUrl && teacher.defaultLook === "photo" && <span className="live">· default</span>}
            </figcaption>
          </figure>
        </div>
        <div className="row">
          <button className="btn secondary" type="button" onClick={toggleDemo}>
            {demo ? "■ Stop" : "▶ See them speak"}
          </button>
          {teacher.photoUrl && teacher.defaultLook !== "photo" && (
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void call("PATCH", { defaultLook: "photo" })}>
              Make the photo the default
            </button>
          )}
        </div>
        <p className="muted small">Learners can switch between the looks on the voice screen; new learners get the default.</p>
      </section>

      <section className="card stack">
        <h2>{teacher.photoUrl ? "Replace the photo" : "Add a teacher photo"}</h2>
        <p className="muted small">
          A clear, front-facing head-and-shoulders photo, face in the middle, plain background. Use a photo of someone who has agreed to be the
          teacher, or an AI-generated face. Never use a real person&apos;s photo without their permission. It is shrunk to 640 pixels so phones load it
          quickly.
        </p>
        <input className="input" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => void pick(e.currentTarget.files?.[0])} />
        <label className="small">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} disabled={busy} /> The person in this photo agreed to
          be shown as the teacher, or the face is AI-generated.
        </label>
        <div className="row">
          <button className="btn" type="button" disabled={busy || !file || !consent} onClick={() => void upload()}>
            Save photo
          </button>
          {teacher.photoUrl && (
            <button className="btn danger" type="button" disabled={busy} onClick={() => void call("DELETE")}>
              Remove photo
            </button>
          )}
        </div>
        {status && <p className="small">{status}</p>}
      </section>
    </div>
  );
}

/** Shrinks a photo to fit within `max` pixels (JPEG), so it downloads quickly on phones. */
async function shrink(file: File, max: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), "image/jpeg", 0.88));
  return new File([blob], "teacher.jpg", { type: "image/jpeg" });
}
