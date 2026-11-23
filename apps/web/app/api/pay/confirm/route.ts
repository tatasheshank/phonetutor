import { currentUser } from "../../../../lib/auth";
import { confirmPayment } from "../../../../lib/payments";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "signed_out" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { orderId?: unknown; paymentId?: unknown; signature?: unknown };
  const result = await confirmPayment(user.id, {
    orderId: String(body.orderId ?? ""),
    paymentId: typeof body.paymentId === "string" ? body.paymentId : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
