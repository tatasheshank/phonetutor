import { istDate, type SessionUsageRecord } from "@ai-tutor/shared";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dailyCapReached, usageLogPath } from "./usage";

/**
 * Cost notifications to the owner's phone via ntfy.sh (free relay, private random topic in NTFY_TOPIC):
 *   - each session's cost when it ends, with today's running total
 *   - once a day: a warning at 80% of the daily cap, and an alert when the cap is reached
 * Never sends secrets or learner details: only amounts, minutes and language.
 * Does nothing when NTFY_TOPIC is not set.
 */
export async function sendNotification(title: string, message: string, tags = "moneybag", priority = 3): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic || !/^[a-z0-9-]{12,64}$/i.test(topic)) return;
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: { Title: asciiHeader(title), Tags: tags, Priority: String(priority) },
      body: message,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn("[notify] could not send notification", err);
  }
}

/** HTTP header values must be plain ASCII; titles are written in English for that reason. */
function asciiHeader(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, "").slice(0, 120);
}

const inr = (n: number) => `Rs ${n.toFixed(2)}`;

/** Remembers which daily alerts were already sent (shared by all job processes through a file). */
interface AlertState {
  date: string;
  warned80: boolean;
  warnedCap: boolean;
}

function statePath(): string {
  return join(dirname(usageLogPath()), "notify-state.json");
}

async function loadState(today: string): Promise<AlertState> {
  try {
    const s = JSON.parse(await readFile(statePath(), "utf8")) as AlertState;
    if (s.date === today) return s;
  } catch {
    // first alert of the day
  }
  return { date: today, warned80: false, warnedCap: false };
}

/** Sends the 80% / cap-reached alerts at most once per day. Call after each usage snapshot. */
export async function checkCapAlerts(now = new Date()): Promise<void> {
  const { spent, cap } = await dailyCapReached();
  if (cap === null) return;
  const today = istDate(now);
  const state = await loadState(today);
  let changed = false;
  if (!state.warnedCap && spent >= cap) {
    state.warnedCap = true;
    state.warned80 = true;
    changed = true;
    await sendNotification(
      "AI Tutor: daily spend cap reached",
      `Today's AI spend reached ${inr(spent)} of your ${inr(cap)} cap. New sessions are blocked until midnight (IST).`,
      "no_entry",
      5,
    );
  } else if (!state.warned80 && spent >= cap * 0.8) {
    state.warned80 = true;
    changed = true;
    await sendNotification(
      "AI Tutor: 80% of daily spend cap",
      `Today's AI spend is ${inr(spent)} of your ${inr(cap)} cap.`,
      "warning",
      4,
    );
  }
  if (changed) {
    try {
      await writeFile(statePath(), JSON.stringify(state));
    } catch {
      // not fatal: worst case an alert repeats
    }
  }
}

/** One notification per finished session: what it cost and today's total. */
export async function notifySessionCost(record: SessionUsageRecord): Promise<void> {
  if (record.cost.total < 0.01) return; // nothing was spent (e.g. joined and left at once)
  const { spent, cap } = await dailyCapReached();
  const minutes = (record.usage.roomMs / 60000).toFixed(1);
  const capText = cap === null ? "no daily cap" : `${inr(spent)} of ${inr(cap)} cap used today`;
  await sendNotification(
    `AI Tutor: session cost ${inr(record.cost.total)}`,
    `${minutes} min in ${record.tutorLanguage.toUpperCase()} · voice ${inr(record.cost.tts)}, hearing ${inr(record.cost.stt)}, answers ${inr(record.cost.llm)}. ${capText}.`,
    "moneybag",
    2,
  );
}
