import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readDb, updateDb, type Order, type Payment } from "./db";
import { testFeaturesAllowed } from "./env";

/**
 * Course payments.
 *   - Razorpay (test or live keys) when RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.
 *   - Otherwise, in development only, a "test payment" that marks the order paid without money moving.
 * The browser never decides a payment succeeded: Razorpay payments are confirmed by checking
 * Razorpay's signature on the server.
 */
export const COURSE = {
  id: "whatsapp-basics",
  name: { te: "వాట్సాప్ & మోసాల నుండి రక్షణ", hi: "व्हाट्सऐप और धोखाधड़ी से बचाव", en: "WhatsApp & staying safe from scams" },
};

export function coursePriceInr(): number {
  const v = Number(process.env.COURSE_PRICE_INR || 99);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 99;
}

export function razorpayConfigured(): boolean {
  return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
}

export function testPaymentsAllowed(): boolean {
  return testFeaturesAllowed() && !razorpayConfigured();
}

export async function hasPaid(userId: string): Promise<boolean> {
  const db = await readDb();
  return db.payments.some((p) => p.userId === userId);
}

/** Creates an order with Razorpay (or a local test order). Amount always comes from the server. */
export async function createOrder(userId: string): Promise<Order & { keyId?: string }> {
  const amountInr = coursePriceInr();
  if (razorpayConfigured()) {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization:
          "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: amountInr * 100, // paise
        currency: "INR",
        receipt: `${userId}-${Date.now()}`.slice(0, 40),
        notes: { userId, course: COURSE.id },
      }),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${res.status} ${await res.text()}`);
    const rp = (await res.json()) as { id: string };
    const order: Order = { id: rp.id, userId, amountInr, provider: "razorpay", status: "created", createdAt: new Date().toISOString() };
    await updateDb((db) => void db.orders.push(order));
    return { ...order, keyId: process.env.RAZORPAY_KEY_ID };
  }

  if (!testPaymentsAllowed()) throw new Error("Payments are not configured");
  const order: Order = {
    id: `test_order_${randomBytes(6).toString("hex")}`,
    userId,
    amountInr,
    provider: "test",
    status: "created",
    createdAt: new Date().toISOString(),
  };
  await updateDb((db) => void db.orders.push(order));
  return order;
}

function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "").update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ConfirmResult = { ok: true; payment: Payment } | { ok: false; error: string };

/** Confirms a payment for an order that belongs to this user, and records it once. */
export async function confirmPayment(
  userId: string,
  input: { orderId: string; paymentId?: string; signature?: string },
): Promise<ConfirmResult> {
  const db = await readDb();
  const order = db.orders.find((o) => o.id === input.orderId && o.userId === userId);
  if (!order) return { ok: false, error: "order_not_found" };

  let paymentId: string;
  if (order.provider === "razorpay") {
    if (!input.paymentId || !input.signature) return { ok: false, error: "missing_signature" };
    if (!verifyRazorpaySignature(order.id, input.paymentId, input.signature)) return { ok: false, error: "bad_signature" };
    paymentId = input.paymentId;
  } else {
    if (!testPaymentsAllowed()) return { ok: false, error: "test_payments_disabled" };
    paymentId = `test_pay_${randomBytes(6).toString("hex")}`;
  }

  const payment = await updateDb((db) => {
    const existing = db.payments.find((p) => p.orderId === order.id);
    if (existing) return existing; // idempotent: a retried confirm doesn't double-count
    const o = db.orders.find((x) => x.id === order.id);
    if (o) o.status = "paid";
    const p: Payment = {
      id: paymentId,
      orderId: order.id,
      userId,
      amountInr: order.amountInr,
      provider: order.provider,
      paidAt: new Date().toISOString(),
    };
    db.payments.push(p);
    return p;
  });
  return { ok: true, payment };
}

/** Live minutes an unpaid learner can use before the payment page. */
export function freeTrialMinutes(): number {
  const v = Number(process.env.FREE_TRIAL_MINUTES ?? 10);
  return Number.isFinite(v) && v >= 0 ? v : 10;
}
