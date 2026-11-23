import { requestOtp } from "../../../../lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
  const result = await requestOtp(String(body.phone ?? ""));
  return Response.json(result, { status: result.ok ? 200 : result.error === "too_soon" ? 429 : 400 });
}
