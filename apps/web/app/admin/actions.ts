"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken, passwordMatches } from "../../lib/adminAuth";

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) redirect("/admin?error=1");
  (await cookies()).set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 7 * 24 * 3600,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin");
}
