import { readFile } from "node:fs/promises";
import { photoFile } from "../../../../lib/teacher";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Public: the teacher photo learners see. The URL carries a version, so it can be cached long. */
export async function GET() {
  const file = await photoFile();
  if (!file) return new Response("Not found", { status: 404 });
  const body = await readFile(/* turbopackIgnore: true */ file.path);
  return new Response(body, {
    headers: {
      "content-type": TYPES[file.ext] ?? "application/octet-stream",
      "content-length": String(file.size),
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
