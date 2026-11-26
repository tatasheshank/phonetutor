import {
  getLanguage,
  isLanguageCode,
  PRICES,
  PRICES_CHECKED_ON,
  summarizeRevenue,
  summarizeUsage,
  parseDailyCap,
  spentToday,
  type CostTotals,
} from "@ai-tutor/shared";
import type { Metadata } from "next";
import { DailyCostChart } from "../../components/admin/DailyCostChart";
import { adminConfigured, isAdmin } from "../../lib/adminAuth";
import { inr, minutes } from "../../lib/format";
import { readDb } from "../../lib/db";
import { coursePriceInr, razorpayConfigured } from "../../lib/payments";
import { loadUsage } from "../../lib/usageStore";
import { login, logout } from "./actions";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cost dashboard", robots: { index: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!adminConfigured()) {
    return (
      <main className="admin" lang="en">
        <h1>Cost dashboard</h1>
        <div className="card">
          <p>
            Set <code>ADMIN_PASSWORD</code> (at least 8 characters) in <code>apps/web/.env.local</code>, then restart{" "}
            <code>npm run dev:web</code>.
          </p>
        </div>
      </main>
    );
  }

  if (!(await isAdmin())) {
    const { error } = await searchParams;
    return (
      <main className="admin" lang="en">
        <h1>Cost dashboard</h1>
        <form action={login} className="card stack">
          <label htmlFor="pw">Admin password</label>
          <input id="pw" name="password" type="password" autoComplete="current-password" required className="input" />
          {error && <p className="err">Wrong password.</p>}
          <button className="btn" type="submit">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  const { records, path, found } = await loadUsage();
  const s = summarizeUsage(records);
  const credit = Number(process.env.SARVAM_CREDIT_INR || 100);
  const budget = Number(process.env.MONTHLY_BUDGET_INR || 0);
  const creditLeft = Math.max(0, credit - s.sarvamSpend);
  const dailyCap = parseDailyCap(process.env.DAILY_SPEND_CAP_INR);
  const spentTodayInr = spentToday(records);
  const db = await readDb();
  const rev = summarizeRevenue(records, db.payments, db.users);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const money = (v: number | null) => (v === null ? "—" : inr(v));

  return (
    <main className="admin" lang="en">
      <header className="admin-head">
        <div>
          <h1>Cost dashboard</h1>
          <p className="muted small">
            Estimates from usage × public prices (checked {PRICES_CHECKED_ON}). Your provider bills are the final word.
          </p>
          <p className="small">
            <a href="/admin/assistant">✨ Lesson assistant: ask for a course →</a> · <a href="/admin/lessons">📚 Lessons: add a lesson from a file →</a> · <a href="/admin/teacher">👩‍🏫 Teacher: drawing or photo →</a>
          </p>
        </div>
        <form action={logout}>
          <button className="btn secondary small-btn" type="submit">
            Sign out
          </button>
        </form>
      </header>

      {!found && (
        <div className="card">
          <p>
            No usage yet. Sessions appear here after you run a lesson with <code>npm run dev:agent</code> running. Log file:{" "}
            <code>{path}</code>
          </p>
        </div>
      )}

      <section className="card">
        <h2>Revenue and profit</h2>
        <p className="muted small">
          Course price {inr(coursePriceInr(), 0)} · payments {razorpayConfigured() ? "via Razorpay" : "in test mode (Razorpay not set up)"} · test
          accounts and test payments are left out of these numbers
          {rev.testRevenue > 0 ? ` (${inr(rev.testRevenue, 0)} of test payments hidden)` : ""}.
        </p>
        <div className="tiles">
          <Tile label="Total revenue" value={inr(rev.revenue.all)} sub={`${plural(rev.payments, "payment")} · this month ${inr(rev.revenue.month)}`} />
          <Tile label="Profit (revenue − AI cost)" value={inr(rev.profit)} sub={`margin ${pct(rev.margin)} · cost ${inr(rev.totalCost)}`} />
          <Tile label="Users" value={String(rev.users)} sub={`${rev.payingUsers} paying (${rev.users ? Math.round((rev.payingUsers / rev.users) * 100) : 0}%)`} />
          <Tile label="Revenue per user" value={money(rev.revenuePerUser)} sub={`per paying user ${money(rev.revenuePerPayingUser)}`} />
          <Tile label="Cost per user" value={money(rev.costPerUser)} sub={`profit per user ${money(rev.profitPerUser)}`} />
        </div>
      </section>

      <h2 className="section-title">AI costs</h2>
      <section className="tiles" aria-label="Totals">
        <Tile label="Today" value={inr(s.today.total)} sub={`${plural(s.today.sessions, "session")} · ${minutes(s.today.liveMinutes)} min`} />
        <Tile label="This month" value={inr(s.month.total)} sub={`${plural(s.month.sessions, "session")} · ${minutes(s.month.liveMinutes)} min`} />
        <Tile label="All time" value={inr(s.all.total)} sub={`${plural(s.all.sessions, "session")} · ${minutes(s.all.liveMinutes)} min`} />
        <Tile
          label="Per live minute"
          value={s.perLiveMinute === null ? "—" : inr(s.perLiveMinute)}
          sub="average across all sessions"
        />
      </section>

      <section className="card">
        <h2>Today&apos;s spending cap</h2>
        {dailyCap === null ? (
          <p className="small">No daily cap (DAILY_SPEND_CAP_INR=0).</p>
        ) : (
          <>
            <Meter value={spentTodayInr} max={dailyCap} />
            <p className="small">
              <strong>{inr(spentTodayInr)}</strong> of {inr(dailyCap, 0)} used today (India time).{" "}
              {spentTodayInr >= dailyCap
                ? "New sessions are blocked until midnight."
                : "At the cap, new sessions are refused and running ones end politely."}{" "}
              Change it with DAILY_SPEND_CAP_INR in both settings files.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Sarvam free credit</h2>
        <Meter value={s.sarvamSpend} max={credit} />
        <p className="small">
          <strong>{inr(creditLeft)}</strong> of {inr(credit, 0)} left (estimated) · about{" "}
          {s.perLiveMinute ? Math.floor(creditLeft / s.perLiveMinute) : "—"} more live minutes at your current rate
        </p>
        {budget > 0 && (
          <>
            <h2 style={{ marginTop: 16 }}>Monthly budget</h2>
            <Meter value={s.month.total} max={budget} />
            <p className="small">
              {inr(s.month.total)} of {inr(budget, 0)} this month ({Math.round((s.month.total / budget) * 100)}%)
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Cost per day (last 14 days)</h2>
        <DailyCostChart days={s.byDay} />
      </section>

      <section className="card">
        <h2>Where the money goes (all time)</h2>
        <Breakdown t={s.all} />
      </section>

      <section className="card">
        <h2>Per user</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th className="num">Sessions</th>
                <th className="num">Live min</th>
                <th className="num">Cost</th>
                <th className="num">Paid</th>
                <th className="num">Profit</th>
                <th>Last active (IST)</th>
              </tr>
            </thead>
            <tbody>
              {rev.perUser.slice(0, 50).map((u) => (
                <tr key={u.userId}>
                  <td>
                    <code>{u.userId}</code>
                    {u.isTest && <span className="tag">test</span>}
                  </td>
                  <td>{u.name ?? <span className="muted">—</span>}</td>
                  <td className="num">{u.sessions}</td>
                  <td className="num">{minutes(u.liveMinutes)}</td>
                  <td className="num">{inr(u.cost)}</td>
                  <td className="num">{u.revenue > 0 ? inr(u.revenue) : <span className="muted">—</span>}</td>
                  <td className="num">
                    <strong className={u.profit < 0 ? "neg" : undefined}>{inr(u.profit)}</strong>
                  </td>
                  <td>
                    {u.lastActiveAt
                      ? new Date(u.lastActiveAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </td>
                </tr>
              ))}
              {rev.perUser.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rev.unattributed.sessions > 0 && (
          <p className="muted small">
            {plural(rev.unattributed.sessions, "older session")} ({inr(rev.unattributed.cost)}) ran before sign-in existed and have no user.
          </p>
        )}
      </section>

      <section className="card">
        <h2>By tutor language</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Language</th>
                <th className="num">Sessions</th>
                <th className="num">Live min</th>
                <th className="num">Cost</th>
                <th className="num">Per min</th>
              </tr>
            </thead>
            <tbody>
              {s.byLanguage.map((l) => (
                <tr key={l.language}>
                  <td>{langName(l.language)}</td>
                  <td className="num">{l.sessions}</td>
                  <td className="num">{minutes(l.liveMinutes)}</td>
                  <td className="num">{inr(l.total)}</td>
                  <td className="num">{l.liveMinutes > 0 ? inr(l.total / l.liveMinutes) : "—"}</td>
                </tr>
              ))}
              {s.byLanguage.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No sessions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Recent sessions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started (IST)</th>
                <th>Lang</th>
                <th className="num">Min</th>
                <th className="num">Questions</th>
                <th className="num">Speech in</th>
                <th className="num">Voice</th>
                <th className="num">Answers</th>
                <th className="num">Total</th>
                <th className="num">1st word</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.slice(0, 25).map((r) => (
                <tr key={r.id}>
                  <td>
                    {new Date(r.startedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}
                    {r.status === "live" && <span className="live"> live</span>}
                  </td>
                  <td>{r.tutorLanguage}</td>
                  <td className="num">{minutes(r.usage.roomMs / 60000)}</td>
                  <td className="num">{r.learnerTurns}</td>
                  <td className="num">{inr(r.cost.stt)}</td>
                  <td className="num">{inr(r.cost.tts)}</td>
                  <td className="num">{inr(r.cost.llm)}</td>
                  <td className="num">
                    <strong>{inr(r.cost.total)}</strong>
                  </td>
                  <td className="num">{r.medianLlmTtftMs === null ? "—" : `${(r.medianLlmTtftMs / 1000).toFixed(1)}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card small">
        <h2>Prices used</h2>
        <ul className="prices">
          <li>Speech to text (Sarvam): {inr(PRICES.sttPerMinute)} per minute of audio</li>
          {Object.entries(PRICES.ttsPerChar).map(([m, p]) => (
            <li key={m}>
              Voice {m}: {inr(p * 1000)} per 1,000 characters
            </li>
          ))}
          {Object.entries(PRICES.llmPerToken).map(([m, p]) => (
            <li key={m}>
              Answers {m}: {inr(p.input * 1e6)} in / {inr(p.output * 1e6)} out per million tokens
            </li>
          ))}
          <li>LiveKit: free plan (set LIVEKIT_PER_MINUTE_INR in the agent if you move to a paid plan)</li>
        </ul>
        <p className="muted">
          Edit prices in <code>packages/shared/src/costs.ts</code>.
        </p>
      </section>
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className="tile-sub">{sub}</div>
    </div>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const state = pct >= 100 ? "critical" : pct >= 80 ? "warning" : "ok";
  return (
    <div className="meter-wrap">
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className={`fill ${state}`} style={{ width: `${pct}%` }} />
      </div>
      {state !== "ok" && <span className={`badge ${state}`}>{state === "critical" ? "⛔ Used up" : "⚠ Over 80%"}</span>}
    </div>
  );
}

/** Horizontal bars, one hue, each labelled with its part and value (no colour-only identity). */
function Breakdown({ t }: { t: CostTotals }) {
  const parts = [
    { label: "Voice (text to speech)", value: t.tts },
    { label: "Hearing (speech to text)", value: t.stt },
    { label: "Answers (LLM)", value: t.llm },
    { label: "LiveKit", value: t.livekit },
  ];
  const max = Math.max(...parts.map((p) => p.value), 0);
  return (
    <div className="viz-root bars">
      {parts.map((p) => (
        <div className="bar-row" key={p.label}>
          <span className="bar-label">{p.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: max > 0 ? `${(p.value / max) * 100}%` : 0 }} />
          </span>
          <span className="bar-value">
            {inr(p.value)}
            <span className="muted"> {t.total > 0 ? `${Math.round((p.value / t.total) * 100)}%` : ""}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function langName(code: string): string {
  return isLanguageCode(code) ? `${getLanguage(code).name.native} (${getLanguage(code).name.en})` : code;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
