import { currentUser, setName } from "../../../../lib/auth";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "signed_out" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  await setName(user.id, String(body.name ?? ""));
  return Response.json({ ok: true });
}
