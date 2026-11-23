import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Minimal password gate for the owner-only admin pages.
 * Set ADMIN_PASSWORD in apps/web/.env.local. The cookie holds an HMAC of the password,
 * so changing the password logs everyone out.
 * TODO(M4): replace with real accounts (phone OTP + an admin role).
 */
export const ADMIN_COOKIE = "tutor_admin";

export function adminConfigured(): boolean {
  return (process.env.ADMIN_PASSWORD ?? "").length >= 8;
}

function tokenFor(password: string): string {
  return createHmac("sha256", password).update("tutor-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  return adminConfigured() && safeEqual(tokenFor(input), tokenFor(expected));
}

export function adminToken(): string {
  return tokenFor(process.env.ADMIN_PASSWORD ?? "");
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const value = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  return safeEqual(value, adminToken());
}
