import { isAdmin } from "../../../../lib/adminAuth";
import { checkUpload, MediaError } from "../../../../lib/lessonMedia";
import { isLiveProviderId } from "@ai-tutor/shared";
import { liveReady, loadTeacher, publicTeacher, removePhoto, savePhoto, setDefaultLook, setLive, TEACHER_LOOKS, type TeacherLook, type TeacherSettings } from "../../../../lib/teacher";

const reply = async (s: TeacherSettings) => Response.json(publicTeacher(s, await liveReady(s)));

/**
 * Admin only: the teacher's look.
 *   POST multipart { photo, consent: "yes" }  upload or replace the teacher photo (PNG/JPG/WebP, up to 5 MB)
 *   PATCH { defaultLook: "drawing" | "photo" | "live" } the look new learners get
 *   PATCH { live: { provider, avatarId? } | null }  choose (or turn off) the free live teacher service
 *   DELETE                                      remove the photo (everyone goes back to the drawing)
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a photo." }, { status: 400 });
  if (form?.get("consent") !== "yes") {
    return Response.json({ error: "Tick the box to confirm you may use this face (the person agreed, or it's AI-generated)." }, { status: 400 });
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const { kind, ext } = checkUpload(file.name, data);
    if (kind !== "image") throw new MediaError("Upload a photo (PNG, JPG or WebP), not a video.");
    const consent = String(form.get("consentNote") ?? "").trim() || "confirmed by admin";
    const saved = await savePhoto(data, ext as "jpg" | "png" | "webp", consent);
    return reply(saved);
  } catch (err) {
    if (err instanceof MediaError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[teacher] photo upload failed", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { defaultLook?: unknown; live?: unknown } | null;
  if (body && "live" in body) {
    const live = body.live as { provider?: unknown; avatarId?: unknown } | null;
    if (live === null) return reply(await setLive(null));
    if (!live || !isLiveProviderId(live.provider)) return Response.json({ error: "Pick one of the free services." }, { status: 400 });
    const avatarId = typeof live.avatarId === "string" ? live.avatarId.trim() : "";
    if (avatarId && !/^[\w.:-]{1,120}$/.test(avatarId)) return Response.json({ error: "That avatar ID doesn't look right." }, { status: 400 });
    return reply(await setLive({ provider: live.provider, ...(avatarId ? { avatarId } : {}) }));
  }
  const look = body?.defaultLook;
  if (!TEACHER_LOOKS.includes(look as TeacherLook)) return Response.json({ error: "Unknown look." }, { status: 400 });
  const current = await loadTeacher();
  if (look === "photo" && !current.photo) return Response.json({ error: "Upload a photo first." }, { status: 400 });
  if (look === "live" && !current.live) return Response.json({ error: "Choose a live teacher service first." }, { status: 400 });
  return reply(await setDefaultLook(look as TeacherLook));
}

export async function DELETE() {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  return reply(await removePhoto());
}
