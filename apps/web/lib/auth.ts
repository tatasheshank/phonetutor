import "server-only";
import { newLearnerId, normalizeIndianMobile } from "@ai-tutor/shared";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { readDb, updateDb, type User } from "./db";
import { testFeaturesAllowed } from "./env";
import { sendOtpSms } from "./sms";

/**
 * Phone + OTP sign-in. One flow covers sign-up and sign-in: a new number creates an account
 * after the OTP is verified.
 *
 * Test account: TEST_ACCOUNT_PHONE + TEST_ACCOUNT_OTP in .env.local. That number never gets an
 * SMS and always accepts the fixed OTP. It is refused in production builds.
 */
export const SESSION_COOKIE = "tutor_session";
const OTP_TTL_MS = 5 * 60_000;
const OTP_RESEND_MS = 30_000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 3600_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function testAccount(): { phone: string; otp: string } | null {
  if (!testFeaturesAllowed()) return null;
  const phone = normalizeIndianMobile(process.env.TEST_ACCOUNT_PHONE ?? "");
  const otp = process.env.TEST_ACCOUNT_OTP ?? "";
  return phone && /^\d{6}$/.test(otp) ? { phone, otp } : null;
}

export type OtpRequestResult = { ok: true; phone: string } | { ok: false; error: "invalid_phone" | "too_soon" | "sms_failed" };

export async function requestOtp(input: string): Promise<OtpRequestResult> {
  const phone = normalizeIndianMobile(input);
  if (!phone) return { ok: false, error: "invalid_phone" };

  const test = testAccount();
  if (test && test.phone === phone) return { ok: true, phone };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = Date.now();
  const tooSoon = await updateDb((db) => {
    const prev = db.otps.find((o) => o.phone === phone);
    if (prev && now - prev.sentAt < OTP_RESEND_MS) return true;
    db.otps = db.otps.filter((o) => o.phone !== phone && o.expiresAt > now);
    db.otps.push({ phone, codeHash: sha256(`${phone}:${code}`), expiresAt: now + OTP_TTL_MS, attempts: 0, sentAt: now });
    return false;
  });
  if (tooSoon) return { ok: false, error: "too_soon" };

  try {
    await sendOtpSms(phone, code);
  } catch (err) {
    console.error("[auth] OTP SMS failed", err);
    return { ok: false, error: "sms_failed" };
  }
  return { ok: true, phone };
}

export type OtpVerifyResult =
  | { ok: true; user: User; isNew: boolean }
  | { ok: false; error: "invalid_phone" | "wrong_code" | "expired" | "too_many_attempts" };

export async function verifyOtp(input: string, code: string): Promise<OtpVerifyResult> {
  const phone = normalizeIndianMobile(input);
  if (!phone) return { ok: false, error: "invalid_phone" };
  const now = Date.now();
  const test = testAccount();
  const isTestLogin = !!test && test.phone === phone;

  if (isTestLogin) {
    if (!safeEqual(code, test.otp)) return { ok: false, error: "wrong_code" };
  } else {
    const check = await updateDb((db) => {
      const entry = db.otps.find((o) => o.phone === phone);
      if (!entry || entry.expiresAt < now) return "expired" as const;
      if (entry.attempts >= OTP_MAX_ATTEMPTS) return "too_many_attempts" as const;
      entry.attempts += 1;
      if (!safeEqual(sha256(`${phone}:${code}`), entry.codeHash)) return "wrong_code" as const;
      db.otps = db.otps.filter((o) => o !== entry);
      return "ok" as const;
    });
    if (check !== "ok") return { ok: false, error: check };
  }

  const token = randomBytes(32).toString("base64url");
  const { user, isNew } = await updateDb((db) => {
    let user = db.users.find((u) => u.phone === phone);
    const isNew = !user;
    if (!user) {
      let id = newLearnerId();
      while (db.users.some((u) => u.id === id)) id = newLearnerId();
      user = { id, phone, name: null, createdAt: new Date(now).toISOString(), isTest: isTestLogin };
      db.users.push(user);
    }
    db.sessions = db.sessions.filter((s) => s.expiresAt > now);
    db.sessions.push({ tokenHash: sha256(token), userId: user.id, expiresAt: now + SESSION_TTL_MS });
    return { user, isNew };
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { ok: true, user, isNew };
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await readDb();
  const hash = sha256(token);
  const session = db.sessions.find((s) => s.tokenHash === hash && s.expiresAt > Date.now());
  return session ? (db.users.find((u) => u.id === session.userId) ?? null) : null;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const hash = sha256(token);
    await updateDb((db) => {
      db.sessions = db.sessions.filter((s) => s.tokenHash !== hash);
    });
  }
  jar.delete(SESSION_COOKIE);
}

export async function setName(userId: string, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  await updateDb((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (u) u.name = clean || null;
  });
}
