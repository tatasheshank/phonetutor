"use server";

import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/adminAuth";
import { deleteDraft, listDrafts, publishDraft, setLessonTopic, unpublishLesson } from "../../../lib/lessonDrafts";
import { deleteLessonMedia } from "../../../lib/lessonMedia";

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin");
}

export async function publish(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const result = await publishDraft(id, "admin");
  redirect(`/admin/lessons/${id}?${result.ok ? "published=1" : "error=" + encodeURIComponent(result.errors.join(" | ").slice(0, 400))}`);
}

export async function unpublish(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await unpublishLesson(id);
  redirect(`/admin/lessons/${id}?unpublished=1`);
}

export async function remove(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await unpublishLesson(id);
  await deleteDraft(id);
  await deleteLessonMedia(id);
  redirect("/admin/lessons");
}

export async function changeTopic(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const picked = String(formData.get("topic") ?? "");
  const topic = picked === "other" ? String(formData.get("newTopic") ?? "") : picked;
  try {
    await setLessonTopic(id, topic);
  } catch (err) {
    redirect(`/admin/lessons/${id}?error=${encodeURIComponent((err as Error).message)}`);
  }
  redirect(`/admin/lessons/${id}?topic=1`);
}

/** Publishes every lesson of a course made by the course splitter (the ones not published yet, or edited since). */
export async function publishCourse(formData: FormData) {
  await requireAdmin();
  const seriesId = String(formData.get("seriesId") ?? "");
  const drafts = (await listDrafts()).filter((d) => d.series?.id === seriesId && (d.status !== "published" || d.pendingChanges));
  const failed: string[] = [];
  for (const d of drafts) {
    const r = await publishDraft(d.id, "admin");
    if (!r.ok) failed.push(`${d.series?.part}. ${d.lesson.locales.en?.title ?? d.id}: ${r.errors[0]}`);
  }
  redirect(`/admin/lessons?${failed.length ? "courseError=" + encodeURIComponent(failed.join(" | ").slice(0, 600)) : "coursePublished=" + drafts.length}#${seriesId}`);
}
