import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Tiny JSON-file data store for the testing phase: users, OTPs, sign-in sessions, orders and payments.
 * One process (the web app) owns it; writes are serialized and atomic (write temp file, then rename).
 *
 * TODO(M4): move to Postgres (users, entitlements, payments tables from the plan) before real users.
 * This file is fine for one developer and a handful of testers, not for production.
 */

export interface User {
  id: string; // learner ID format, e.g. "K7Q2-M9XA"
  phone: string; // E.164, e.g. "+919876543210"
  name: string | null;
  createdAt: string;
  isTest: boolean;
}

export interface OtpEntry {
  phone: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

export interface SignInSession {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

export interface Order {
  id: string; // our order id, or Razorpay's order_id
  userId: string;
  amountInr: number;
  provider: "razorpay" | "test";
  status: "created" | "paid" | "failed";
  createdAt: string;
}

export interface Payment {
  id: string; // Razorpay payment_id, or "test_..." for test payments
  orderId: string;
  userId: string | null;
  amountInr: number;
  provider: "razorpay" | "test" | "manual";
  paidAt: string;
  note?: string;
}

export interface Db {
  users: User[];
  otps: OtpEntry[];
  sessions: SignInSession[];
  orders: Order[];
  payments: Payment[];
}

function empty(): Db {
  return { users: [], otps: [], sessions: [], orders: [], payments: [] };
}

export function dbPath(): string {
  if (process.env.APP_DB_PATH) return resolve(process.env.APP_DB_PATH);
  return resolve(process.cwd(), "../../data/app-db.json");
}

async function load(): Promise<Db> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dbPath(), "utf8")) as Partial<Db>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Read-only snapshot. */
export async function readDb(): Promise<Db> {
  await queue.catch(() => {});
  return load();
}

/** Serialized read-modify-write. The callback mutates `db` in place and may return a value. */
export function updateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    const path = dbPath();
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await rename(tmp, path);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
