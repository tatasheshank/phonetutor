import { LIVE_PROVIDERS, liveUsageKey, type LiveProviderId } from "@ai-tutor/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveTeacherSettings } from "../../../components/admin/LiveTeacherSettings";
import { TeacherSettings } from "../../../components/admin/TeacherSettings";
import { isAdmin } from "../../../lib/adminAuth";
import { liveReady, liveStatus, liveUsage, loadTeacher, publicTeacher } from "../../../lib/teacher";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teacher", robots: { index: false } };

export default async function TeacherAdminPage() {
  if (!(await isAdmin())) redirect("/admin");
  const settings = await loadTeacher();
  const [ready, status, usage] = await Promise.all([liveReady(settings), liveStatus(), liveUsage()]);
  const teacher = publicTeacher(settings, ready);
  const used = Object.fromEntries(LIVE_PROVIDERS.map((p) => [p.id, usage.minutes[p.id]?.[liveUsageKey(p)] ?? 0])) as Record<LiveProviderId, number>;

  return (
    <main className="admin" lang="en">
      <header className="admin-head">
        <div>
          <h1>Teacher</h1>
          <p className="muted small">
            <Link href="/admin">← Cost dashboard</Link> · <Link href="/admin/lessons">Lessons</Link>
          </p>
        </div>
      </header>
      <TeacherSettings initial={{ defaultLook: teacher.defaultLook === "live" ? (teacher.photoUrl ? "photo" : "drawing") : teacher.defaultLook, photoUrl: teacher.photoUrl }} />
      <LiveTeacherSettings
        info={{
          config: settings.live ?? null,
          keys: status?.keys ?? null,
          used,
          isDefault: settings.defaultLook === "live",
        }}
      />
    </main>
  );
}
