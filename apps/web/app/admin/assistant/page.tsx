import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AssistantChat } from "../../../components/admin/AssistantChat";
import { isAdmin } from "../../../lib/adminAuth";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lesson assistant", robots: { index: false } };

export default async function AssistantPage() {
  if (!(await isAdmin())) redirect("/admin");
  return (
    <main className="admin" lang="en">
      <header className="admin-head">
        <div>
          <h1>✨ Lesson assistant</h1>
          <p className="muted small">
            <Link href="/admin">← Cost dashboard</Link> · <Link href="/admin/lessons">Lessons</Link>
          </p>
        </div>
      </header>
      <AssistantChat youtubeKey={Boolean(process.env.YOUTUBE_API_KEY)} />
    </main>
  );
}
