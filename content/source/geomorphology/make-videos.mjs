// Turns the rendered slides into four silent board videos (7 s per slide), ready to upload.
//   node content/source/geomorphology/make-videos.mjs
// Needs ffmpeg (FFMPEG env var, on PATH, or the winget Gyan.FFmpeg install).
// Output: content/source/geomorphology/videos/geo-v*.mp4 (720p H.264, a keyframe every second so the
// player can jump to any cue time quickly, faststart for mobile streaming).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SECONDS_PER_SLIDE = 7;
const FPS = 10; // still images: 10 fps keeps files small; keyframe every 10 frames = 1 s

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch {}
  const root = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData/Local"), "Microsoft/WinGet/Packages");
  const stack = existsSync(root) ? [root] : [];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name.toLowerCase() === "ffmpeg.exe") return p;
      try {
        if (statSync(p).isDirectory()) stack.push(p);
      } catch {}
    }
  }
  throw new Error("ffmpeg not found. Install it (winget install Gyan.FFmpeg) or set FFMPEG.");
}

const ffmpeg = findFfmpeg();
const manifest = JSON.parse(readFileSync(join(here, "slides.json"), "utf8"));
const names = { v1: "geo-v1-forces", v2: "geo-v2-processes", v3: "geo-v3-agents", v4: "geo-v4-plates-cycle" };
const outDir = join(here, "videos");
mkdirSync(outDir, { recursive: true });

for (const [video, slides] of Object.entries(manifest)) {
  // concat demuxer list: each slide shown for SECONDS_PER_SLIDE (last one repeated, as ffmpeg requires)
  const list = slides.map((s) => `file '${join(here, "slides", `${s.slide}.png`).replace(/\\/g, "/")}'\nduration ${SECONDS_PER_SLIDE}`).join("\n");
  const last = join(here, "slides", `${slides.at(-1).slide}.png`).replace(/\\/g, "/");
  const listPath = join(outDir, `${video}.txt`);
  writeFileSync(listPath, `${list}\nfile '${last}'\n`);
  const out = join(outDir, `${names[video]}.mp4`);
  execFileSync(
    ffmpeg,
    [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", listPath,
      "-vf", `fps=${FPS},scale=1280:720,format=yuv420p`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-tune", "stillimage",
      "-g", String(FPS), "-keyint_min", String(FPS), "-sc_threshold", "0",
      "-t", String(slides.length * SECONDS_PER_SLIDE),
      "-movflags", "+faststart", "-an",
      out,
    ],
    { stdio: "inherit" },
  );
  console.log(`${names[video]}.mp4: ${slides.length} slides, ${slides.length * SECONDS_PER_SLIDE} s, ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
