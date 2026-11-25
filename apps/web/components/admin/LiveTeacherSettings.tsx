"use client";

import { LIVE_PROVIDERS, LIVE_SAFETY_MINUTES, type LiveProviderId } from "@ai-tutor/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface LiveTeacherInfo {
  /** The chosen service, if any. */
  config: { provider: LiveProviderId; avatarId?: string } | null;
  /** Which services the tutor has API keys for; null = the tutor hasn't started since this was added. */
  keys: Record<LiveProviderId, boolean> | null;
  /** Free minutes used (this month, or of the one-time trial) per service. */
  used: Record<LiveProviderId, number>;
  isDefault: boolean;
}

/**
 * Admin: the live (talking video) teacher, FREE ONLY. Pick one of the services with a free
 * allowance; the tutor stops using it before the free minutes run out, so it never costs money.
 */
export function LiveTeacherSettings({ info }: { info: LiveTeacherInfo }) {
  const router = useRouter();
  const [provider, setProvider] = useState<LiveProviderId | "">(info.config?.provider ?? "");
  const [avatarId, setAvatarId] = useState(info.config?.avatarId ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function patch(body: unknown, done: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/teacher", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setStatus(done);
      router.refresh();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const chosen = LIVE_PROVIDERS.find((p) => p.id === provider);
  const saved = info.config?.provider;

  return (
    <section className="card stack">
      <h2>Live teacher (free only)</h2>
      <p className="muted small">
        A lifelike face whose lips move with the teacher&apos;s voice. Only services with free minutes are offered, and the tutor stops using the
        live teacher before the free minutes run out: learners then see the photo or drawing instead, so it never costs money. A lesson in progress
        ends politely if the minutes run out mid-way.
      </p>

      <div className="live-options" role="radiogroup" aria-label="Live teacher service">
        {LIVE_PROVIDERS.map((p) => {
          const hasKey = info.keys?.[p.id];
          const used = info.used[p.id] ?? 0;
          const left = Math.max(0, p.freeMinutesPerMonth - used);
          return (
            <label key={p.id} className={`live-option${provider === p.id ? " chosen" : ""}`}>
              <input type="radio" name="live" checked={provider === p.id} onChange={() => setProvider(p.id)} disabled={busy} />
              <span className="stack">
                <strong>
                  {p.name} {saved === p.id && <span className="live">· in use</span>}
                </strong>
                <span className="small">{p.freeTier}</span>
                <span className="small">
                  Free minutes {p.trialOnly ? "(one-time trial)" : "this month"}: {used.toFixed(1)} used of {p.freeMinutesPerMonth} ·{" "}
                  <strong>{left.toFixed(1)} left</strong>
                  {left < LIVE_SAFETY_MINUTES && <span className="err"> (used up: not offered)</span>}
                </span>
                <span className="small">
                  {info.keys === null
                    ? "Key: unknown (restart the tutor once to check)"
                    : hasKey
                      ? "✅ Key set in the tutor"
                      : `❌ No key: add ${p.keyEnv}=… to apps/agent/.env and restart the tutor`}{" "}
                  · <a href={p.signUpUrl} target="_blank" rel="noreferrer">Sign up</a>
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {chosen && (
        <label className="field">
          <span>{chosen.avatarIdLabel}</span>
          <input className="input" value={avatarId} maxLength={120} disabled={busy} onChange={(e) => setAvatarId(e.currentTarget.value)} />
        </label>
      )}

      <div className="row">
        <button
          className="btn"
          type="button"
          disabled={busy || !provider}
          onClick={() => void patch({ live: { provider, avatarId } }, "Saved. Learners can choose the live teacher once the tutor has the key.")}
        >
          Use {chosen?.name ?? "this service"}
        </button>
        {saved && (
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void patch({ live: null }, "Live teacher turned off.")}>
            Turn off live teacher
          </button>
        )}
        {saved && !info.isDefault && (
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void patch({ defaultLook: "live" }, "New learners get the live teacher (while free minutes last).")}>
            Make it the default
          </button>
        )}
      </div>
      <p className="muted small">
        Keys stay on the tutor (apps/agent/.env), never in this page. Free tiers can change; check each service&apos;s pricing page.
      </p>
      {status && <p className="small">{status}</p>}
    </section>
  );
}
