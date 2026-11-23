import { currentUser } from "../../../../lib/auth";
import { COURSE, createOrder, hasPaid } from "../../../../lib/payments";

export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "signed_out" }, { status: 401 });
  if (await hasPaid(user.id)) return Response.json({ ok: false, error: "already_paid" }, { status: 409 });
  try {
    const order = await createOrder(user.id);
    return Response.json({
      ok: true,
      order: { id: order.id, amountInr: order.amountInr, provider: order.provider, keyId: order.keyId },
      course: COURSE,
      prefill: { contact: user.phone, name: user.name ?? undefined },
    });
  } catch (err) {
    console.error("[pay] order failed", err);
    return Response.json({ ok: false, error: "order_failed" }, { status: 502 });
  }
}
