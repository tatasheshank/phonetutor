import { formatIndianMobile } from "@ai-tutor/shared";
import { verifyOtp } from "../../../../lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };
  const result = await verifyOtp(String(body.phone ?? ""), String(body.code ?? "").trim());
  if (!result.ok) return Response.json(result, { status: 400 });
  const { user, isNew } = result;
  return Response.json({ ok: true, isNew, user: { id: user.id, name: user.name, phone: formatIndianMobile(user.phone) } });
}
