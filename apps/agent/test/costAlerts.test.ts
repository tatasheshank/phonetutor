import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCapAlerts, notifySessionCost, sendNotification } from "../src/costAlerts";
import { UsageTracker, writeUsage } from "../src/usage";

const meta = {
  id: "tutor-1",
  tutorLanguage: "te",
  screenLanguage: "en",
  llmProvider: "sarvam",
  llmModel: "sarvam-105b-conversations",
  ttsModel: "bulbul:v4-flash",
  sttStreaming: false,
};

let calls: Array<{ url: string; title: string; body: string }> = [];

beforeEach(() => {
  calls = [];
  process.env.USAGE_LOG_PATH = join(mkdtempSync(join(tmpdir(), "alerts-")), "usage.jsonl");
  process.env.NTFY_TOPIC = "aitutor-testtopic123";
  vi.stubGlobal("fetch", async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, title: init.headers.Title ?? "", body: init.body });
    return new Response("ok");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.USAGE_LOG_PATH;
  delete process.env.NTFY_TOPIC;
  delete process.env.DAILY_SPEND_CAP_INR;
});

async function spend(chars: number, id = "s1") {
  const t = new UsageTracker({ ...meta, id }, 0, Date.now() - 60_000);
  t.add({ type: "tts_metrics", charactersCount: chars }); // Rs 2 per 1000 chars
  const r = t.record("ended");
  await writeUsage(r);
  return r;
}

describe("cost notifications", () => {
  it("does nothing without NTFY_TOPIC", async () => {
    delete process.env.NTFY_TOPIC;
    await sendNotification("x", "y");
    expect(calls).toHaveLength(0);
  });

  it("sends the session cost with today's total", async () => {
    process.env.DAILY_SPEND_CAP_INR = "50";
    const r = await spend(5000); // Rs 10
    await notifySessionCost(r);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://ntfy.sh/aitutor-testtopic123");
    expect(calls[0]!.title).toBe("AI Tutor: session cost Rs 10.00");
    expect(calls[0]!.body).toContain("Rs 10.00 of Rs 50.00 cap used today");
  });

  it("skips sessions that cost nothing", async () => {
    const r = await spend(0);
    await notifySessionCost(r);
    expect(calls).toHaveLength(0);
  });

  it("warns once at 80% and once at the cap", async () => {
    process.env.DAILY_SPEND_CAP_INR = "20";
    await spend(8500, "a"); // Rs 17 = 85%
    await checkCapAlerts();
    await checkCapAlerts(); // no repeat
    expect(calls.map((c) => c.title)).toEqual(["AI Tutor: 80% of daily spend cap"]);

    await spend(2000, "b"); // total Rs 21 >= 20
    await checkCapAlerts();
    await checkCapAlerts();
    expect(calls.map((c) => c.title)).toEqual(["AI Tutor: 80% of daily spend cap", "AI Tutor: daily spend cap reached"]);
  });

  it("never sends when there is no cap", async () => {
    process.env.DAILY_SPEND_CAP_INR = "0";
    await spend(50_000);
    await checkCapAlerts();
    expect(calls).toHaveLength(0);
  });
});
