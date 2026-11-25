import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isAdmin } from "../../../../../../lib/adminAuth";
import { loadDraft } from "../../../../../../lib/lessonDrafts";

// Recording a long lesson in three languages takes a while.
export const maxDuration = 300;

/**
 * Admin only: pre-record a PUBLISHED lesson's narration with the tutor's default voice, by running
 * the agent's own script (apps/agent/scripts/prerecord.ts --lesson=<id>), so learners hear saved
 * audio. Costs Sarvam credit, so:
 *   POST { record: false }  -> estimate only (free): { lines, chars, costInr }
 *   POST { record: true }   -> records the missing lines: { recorded, failed, costInr }
 * Lines already recorded are skipped. Unrecorded lines still record themselves on first use.
 * Needs the agent's code next to the web app (true on the laptop and in the repo checkout).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: "Sign in as admin first." }, { status: 401 });
  const { id } = await params;
  const draft = await loadDraft(id);
  if (!draft) return Response.json({ error: "Lesson not found." }, { status: 404 });
  if (draft.status !== "published") return Response.json({ error: "Publish the lesson first: only published text is recorded." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { record?: unknown };
  const record = body.record === true;

  const agentDir = resolve(/* turbopackIgnore: true */ process.cwd(), "../agent");
  const tsxCli = resolve(/* turbopackIgnore: true */ process.cwd(), "../../node_modules/tsx/dist/cli.mjs");
  if (!existsSync(/* turbopackIgnore: true */ resolve(agentDir, "scripts/prerecord.ts")) || !existsSync(/* turbopackIgnore: true */ tsxCli)) {
    return Response.json({ error: "Pre-recording runs where the tutor's code is (the laptop). It isn't available on this server." }, { status: 501 });
  }

  const args = [tsxCli, "scripts/prerecord.ts", `--lesson=${id}`, "--json", ...(record ? ["--yes"] : [])];
  const result = await new Promise<{ out: string; code: number }>((done) => {
    execFile(process.execPath, args, { cwd: agentDir, timeout: 280_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code ?? 1) : err ? 1 : 0;
      done({ out: `${stdout}\n${stderr}`, code });
    });
  });

  const summaries = result.out
    .split("\n")
    .filter((l) => l.startsWith("JSON "))
    .map((l) => {
      try {
        return JSON.parse(l.slice(5)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((x): x is Record<string, unknown> => !!x);
  const estimate = summaries.find((s) => s.phase === "estimate");
  const done = summaries.find((s) => s.phase === "done");
  if (!estimate) {
    console.error("[prerecord] failed", result.out.slice(-1500));
    return Response.json({ error: "Pre-recording didn't start. Check the tutor's settings (SARVAM_API_KEY)." }, { status: 500 });
  }
  if (record) {
    console.log(`[prerecord] ${id}: ${JSON.stringify(done ?? estimate)}`);
    return Response.json({ recorded: done?.recorded ?? 0, failed: done?.failed ?? 0, costInr: done?.costInr ?? 0, ok: result.code === 0 });
  }
  return Response.json({ lines: estimate.lines, chars: estimate.chars, costInr: estimate.costInr });
}
