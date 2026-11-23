/**
 * End-to-end smoke test for the lesson player, no microphone needed.
 * Joins a LiveKit room as a fake learner, starts a lesson and watches the teacher's demonstration,
 * then answers "yes" to the check question.
 * Prints every event the tutor sends. The agent worker must be running (npm run dev:agent).
 *
 *   npx tsx scripts/lesson-smoke.ts [lessonId] [te|hi|en]
 *
 * Costs a few paise: the tutor really speaks (Sarvam TTS), nobody listens.
 */
import { DATA_TOPIC, decodeEvent, encodeEvent, type AgentEvent, type ClientEvent } from "@ai-tutor/shared";
import { Room, RoomEvent } from "@livekit/rtc-node";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";
import { randomUUID } from "node:crypto";

dotenv.config();
const lessonId = process.argv[2] ?? "wa-video-call-01";
const lang = (process.argv[3] ?? "en") as "te" | "hi" | "en";
const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) throw new Error("LiveKit env not set");

const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
  identity: `smoke-${randomUUID().slice(0, 6)}`,
  metadata: JSON.stringify({ tutorLanguage: lang, screenLanguage: "en", lessonId }),
  ttl: "10m",
});
token.addGrant({ room: `smoke-${randomUUID()}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

const room = new Room();
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

function send(e: ClientEvent) {
  log(`→ ${JSON.stringify(e)}`);
  void room.localParticipant?.publishData(encodeEvent(e), { reliable: true, topic: DATA_TOPIC });
}

const finished = new Promise<boolean>((resolve) => {
  setTimeout(() => resolve(false), 240_000);
  room.on(RoomEvent.DataReceived, (payload, _p, _kind, topic) => {
    if (topic !== DATA_TOPIC) return;
    const e = decodeEvent<AgentEvent>(payload);
    if (!e || e.type === "avatar_state") return;
    log(`← ${JSON.stringify(e)}`);
    if (e.type === "check") setTimeout(() => send({ type: "check_answer", stepId: e.stepId, value: "yes" }), 4000);
    if (e.type === "lesson_done") setTimeout(() => resolve(true), 6000);
  });
});

await room.connect(LIVEKIT_URL, await token.toJwt(), { autoSubscribe: true, dynacast: false });
log(`joined; waiting for the tutor to start "${lessonId}" in ${lang}`);
const ok = await finished;
await room.disconnect();
log(ok ? "PASS: lesson reached lesson_done" : "FAIL: timed out before lesson_done");
process.exit(ok ? 0 : 1);
