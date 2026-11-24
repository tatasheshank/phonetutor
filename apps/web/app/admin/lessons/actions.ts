"use server";

import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/adminAuth";
import { deleteDraft, publishDraft, unpublishLesson } from "../../../lib/lessonDrafts";

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
  redirect("/admin/lessons");
}
