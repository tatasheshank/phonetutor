import { isLanguageCode, isSpeechRate, type ParticipantSettings } from "@ai-tutor/shared";
import { AccessToken } from "livekit-server-sdk";
import { randomUUID } from "node:crypto";
import { currentUser } from "../../../lib/auth";
import { freeTrialMinutes, hasPaid } from "../../../lib/payments";
import { liveMinutesUsed } from "../../../lib/usageStore";

/**
 * Mints a LiveKit token for one tutor session. Requires a signed-in user.
 * Unpaid users get FREE_TRIAL_MINUTES of live tutoring, then must pay.
 * The learner's settings travel as participant metadata, which the agent worker reads on join.
 *
 * TODO(M4): enforce one live session per user (Redis lock) and per-day minute caps.
 */
export async function POST(req: Request) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return Response.json({ error: "LiveKit is not configured on the server" }, { status: 500 });
  }

  const user = await currentUser();
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  if (!(await hasPaid(user.id)) && (await liveMinutesUsed(user.id)) >= freeTrialMinutes()) {
    return Response.json({ error: "payment_required" }, { status: 402 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isLanguageCode(body.tutorLanguage) || !isLanguageCode(body.screenLanguage)) {
    return Response.json({ error: "Unknown language" }, { status: 400 });
  }

  const settings: ParticipantSettings = {
    tutorLanguage: body.tutorLanguage,
    screenLanguage: body.screenLanguage,
    learnerId: user.id, // from the sign-in session, never from the request body
    lessonId: typeof body.lessonId === "string" && /^[a-z0-9-]{1,80}$/.test(body.lessonId) ? body.lessonId : undefined,
    // The learner's picked voice and speed; the agent re-checks the id against the language's voices.
    voiceId: typeof body.voiceId === "string" && /^[a-z0-9-]{1,40}$/.test(body.voiceId) ? body.voiceId : undefined,
    speechRate: isSpeechRate(body.speechRate) ? body.speechRate : undefined,
  };

  const identity = `learner-${user.id}-${randomUUID().slice(0, 8)}`;
  const room = `tutor-${randomUUID()}`;
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    metadata: JSON.stringify(settings),
    ttl: "35m", // a little over the agent's 30-minute room limit
  });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

  return Response.json({ url: LIVEKIT_URL, token: await token.toJwt(), room });
}
