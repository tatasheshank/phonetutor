// Draws the board-video slides for "Fundamentals of Geomorphology" as 1280x720 PNGs, and writes
// slides.json with, for each slide, where the teacher should point (fractions of the frame).
//   node content/source/geomorphology/make-slides.mjs
// Labels are in English on purpose: these terms are taught in English in Indian textbooks;
// the tutor narrates in Telugu, Hindi or English.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "slides");
mkdirSync(out, { recursive: true });
const W = 1280, H = 720;

const C = {
  bg: "#f8fafc", ink: "#0f172a", muted: "#475569", sky: "#dbeafe", ground: "#d6b98c", rock: "#94a3b8",
  rockDark: "#64748b", grass: "#86efac", water: "#3b82f6", waterLight: "#93c5fd", sand: "#fcd34d",
  ice: "#e0f2fe", magma: "#ef4444", lava: "#f97316", up: "#16a34a", down: "#dc2626", accent: "#7c3aed",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (x, y, s, { size = 26, weight = 600, fill = C.ink, anchor = "middle" } = {}) =>
  `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const label = (x, y, s, opts = {}) =>
  `<g><rect x="${x - (s.length * 7.5 + 14)}" y="${y - 24}" width="${s.length * 15 + 28}" height="34" rx="8" fill="#ffffffd9" stroke="#cbd5e1"/>${text(x, y, s, { size: 22, ...opts })}</g>`;
const arrow = (x1, y1, x2, y2, color, w = 8) => {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 22;
  const p1 = [x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)], p2 = [x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)];
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/><polygon points="${x2},${y2} ${p1} ${p2}" fill="${color}"/>`;
};
const sky = () => `<rect x="0" y="90" width="${W}" height="${H - 160}" fill="${C.sky}"/>`;
const sun = (x, y) => `<circle cx="${x}" cy="${y}" r="38" fill="#fde047"/>`;
const cloud = (x, y) => `<g fill="#fff"><ellipse cx="${x}" cy="${y}" rx="70" ry="30"/><ellipse cx="${x - 40}" cy="${y + 10}" rx="45" ry="24"/><ellipse cx="${x + 45}" cy="${y + 12}" rx="45" ry="22"/></g>`;
const rain = (x, y) => Array.from({ length: 7 }, (_, i) => `<line x1="${x - 60 + i * 20}" y1="${y}" x2="${x - 70 + i * 20}" y2="${y + 40}" stroke="${C.water}" stroke-width="4" stroke-linecap="round"/>`).join("");

function slide(title, caption, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="90" fill="#0f766e"/>${text(40, 58, title, { size: 38, weight: 700, fill: "#fff", anchor: "start" })}
  ${body}
  <rect y="${H - 70}" width="${W}" height="70" fill="#f1f5f9"/>${text(W / 2, H - 25, caption, { size: 28, weight: 600, fill: C.ink })}
</svg>`;
}

// ---------- slide bodies ----------
const S = {};

S.v1_1 = slide("What is geomorphology?", "The study of landforms and how they are made and changed",
  `${sky()}${sun(1150, 150)}
  <polygon points="80,560 300,200 520,560" fill="${C.rock}"/><polygon points="300,200 250,280 350,280" fill="#fff"/>
  <polygon points="420,560 600,330 780,560" fill="${C.rockDark}"/>
  <rect x="0" y="560" width="900" height="90" fill="${C.grass}"/>
  <path d="M600,560 C640,590 700,600 760,620 C820,640 860,640 900,650" stroke="${C.water}" stroke-width="18" fill="none"/>
  <polygon points="860,560 1000,650 840,650" fill="${C.sand}"/><rect x="900" y="560" width="380" height="90" fill="${C.water}"/>
  ${label(300, 180, "Mountain")}${label(470, 530, "Valley")}${label(200, 610, "Plain")}${label(930, 545, "Delta")}${label(1120, 610, "Sea")}`);

S.v1_2 = slide("Endogenic forces: from inside the Earth", "Build land up: volcanoes, earthquakes, rising mountains",
  `${sky()}<rect x="0" y="420" width="${W}" height="230" fill="${C.ground}"/>
  <ellipse cx="640" cy="610" rx="230" ry="40" fill="${C.magma}"/>${text(640, 618, "Magma (hot melted rock)", { size: 22, fill: "#fff" })}
  <polygon points="470,420 640,190 810,420" fill="#78716c"/><polygon points="610,230 670,230 655,560 625,560" fill="${C.lava}"/>
  <g fill="#9ca3af"><circle cx="620" cy="160" r="26"/><circle cx="660" cy="140" r="30"/><circle cx="700" cy="120" r="24"/></g>
  ${arrow(300, 600, 300, 470, C.up)}${arrow(980, 600, 980, 470, C.up)}
  ${label(640, 105 + 60, "Volcano")}${label(300, 450, "Push up")}${label(980, 450, "Push up")}`);

S.v1_3 = slide("Exogenic forces: on the surface", "Wear land down: sun, rain, rivers, wind, ice and waves",
  `${sky()}${sun(180, 170)}${cloud(860, 180)}${rain(860, 215)}
  <polygon points="300,600 620,250 940,600" fill="${C.rock}"/>
  <path d="M620,270 C600,350 660,420 630,500 C610,560 650,590 640,600" stroke="${C.water}" stroke-width="12" fill="none"/>
  ${[0, 1, 2].map((i) => `<path d="M${980 + i * 10},${330 + i * 50} q40,-15 80,0 t80,0" stroke="#64748b" stroke-width="5" fill="none"/>`).join("")}
  <rect x="0" y="600" width="${W}" height="50" fill="${C.grass}"/>
  ${label(180, 245, "Sun (heat)")}${label(860, 300, "Rain")}${label(640, 545, "River")}${label(1080, 310, "Wind")}`);

S.v1_4 = slide("A tug-of-war that shapes the land", "Inside forces push up; surface forces wear down",
  `${sky()}<polygon points="340,600 640,230 940,600" fill="${C.rock}"/><rect x="0" y="600" width="${W}" height="50" fill="${C.grass}"/>
  ${arrow(470, 620, 470, 330, C.up, 12)}${arrow(560, 620, 560, 290, C.up, 12)}
  ${arrow(730, 250, 730, 560, C.down, 12)}${arrow(820, 330, 820, 580, C.down, 12)}
  ${label(380, 260, "Endogenic: build up", { fill: C.up })}${label(900, 230, "Exogenic: wear down", { fill: C.down })}`);

S.v2_1 = slide("Step 1 · Weathering: rock breaks in place", "Heat & cold, water, chemicals and roots crack rock; nothing moves yet",
  `${sky()}${sun(180, 170)}<circle cx="1100" cy="170" r="34" fill="#e2e8f0"/><circle cx="1088" cy="160" r="30" fill="${C.sky}"/>
  <rect x="0" y="560" width="${W}" height="90" fill="${C.ground}"/>
  <path d="M380,560 L420,330 L560,280 L760,300 L880,380 L900,560 Z" fill="${C.rock}"/>
  <path d="M600,290 L585,380 L615,440 L590,520" stroke="#334155" stroke-width="6" fill="none"/>
  <path d="M760,305 L740,380 L770,430" stroke="#334155" stroke-width="5" fill="none"/>
  <path d="M480,320 C470,380 500,430 480,520" stroke="#166534" stroke-width="7" fill="none"/><circle cx="480" cy="305" r="26" fill="${C.up}"/>
  ${label(180, 245, "Hot day")}${label(1090, 245, "Cold night")}${label(600, 260, "Crack")}${label(430, 560, "Roots")}`);

S.v2_2 = slide("Step 2 · Mass movement: gravity pulls it down", "Loose rock and soil slide downhill: landslides, rock falls",
  `${sky()}${cloud(250, 170)}${rain(250, 205)}
  <polygon points="200,640 700,200 1100,640" fill="${C.ground}"/>
  <polygon points="760,330 840,330 980,560 880,560" fill="#a16207"/>
  ${[[820, 380], [870, 450], [920, 520], [960, 590]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="18" fill="${C.rockDark}"/>`).join("")}
  ${arrow(800, 360, 960, 600, C.down, 8)}${label(1000, 400, "Landslide")}${label(250, 300, "Heavy rain")}`);

S.v2_3 = slide("Step 3 · Erosion & transport: an agent carries it", "Water, wind, ice or waves pick up broken rock and carry it away",
  `${sky()}<rect x="0" y="420" width="${W}" height="230" fill="${C.grass}"/>
  <path d="M0,520 C300,470 500,600 800,540 C1000,500 1150,560 1280,540 L1280,620 C1150,640 1000,580 800,620 C500,680 300,550 0,600 Z" fill="${C.water}"/>
  ${[[150, 550], [330, 560], [520, 600], [700, 585], [900, 555], [1080, 575]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${12 - i}" fill="${C.ground}" stroke="#7c5a2a"/>`).join("")}
  ${arrow(200, 470, 1050, 470, C.accent, 7)}${label(640, 440, "River carries sand and pebbles")}`);

S.v2_4 = slide("Step 4 · Deposition: the agent drops it", "When the river slows at the sea, it drops sediment and builds a delta",
  `<rect x="0" y="90" width="${W}" height="560" fill="${C.water}"/>
  <path d="M0,90 L560,90 C620,200 640,260 700,320 C760,380 860,430 980,470 L980,650 L0,650 Z" fill="${C.grass}"/>
  <path d="M560,320 C700,360 820,420 900,520 C760,560 640,560 520,520 Z" fill="${C.sand}"/>
  <path d="M520,90 C560,180 600,250 640,320" stroke="${C.waterLight}" stroke-width="22" fill="none"/>
  <path d="M640,320 C680,380 700,440 690,520 M640,320 C720,360 780,410 820,480 M640,320 C620,390 590,450 560,510" stroke="${C.waterLight}" stroke-width="12" fill="none"/>
  ${label(700, 470, "Delta (new land)")}${label(1100, 300, "Sea")}${label(450, 200, "River")}`);

S.v3_1 = slide("Running water: V-shaped valleys and deltas", "Rivers cut V-valleys in hills and build deltas at the sea (Godavari, Krishna)",
  `${sky()}<polygon points="60,180 360,600 660,180 660,650 60,650" fill="${C.rock}"/><path d="M330,560 L360,600 L390,560 Z" fill="${C.water}"/>
  ${label(360, 520, "V-valley")}
  <rect x="700" y="180" width="540" height="420" rx="16" fill="${C.grass}"/>
  <path d="M720,240 C900,240 900,360 1000,360 C1100,360 1100,470 1220,470" stroke="${C.water}" stroke-width="18" fill="none"/>
  <ellipse cx="1050" cy="250" rx="60" ry="26" fill="none" stroke="${C.water}" stroke-width="12"/>
  ${label(950, 300, "Meander")}${label(1050, 215, "Ox-bow lake")}`);

S.v3_2 = slide("Wind: sand dunes in deserts", "In the Thar Desert, wind piles sand into crescent dunes (barchans)",
  `<rect x="0" y="90" width="${W}" height="560" fill="#fef3c7"/>${sun(1120, 170)}
  <path d="M200,560 C300,380 520,360 620,560 C560,500 470,480 420,560 Z" fill="${C.sand}" stroke="#b45309" stroke-width="3"/>
  <path d="M680,600 C760,450 940,440 1020,600 C980,550 900,540 860,600 Z" fill="${C.sand}" stroke="#b45309" stroke-width="3"/>
  ${[0, 1, 2].map((i) => arrow(60, 300 + i * 60, 220, 300 + i * 60, "#64748b", 5)).join("")}
  ${label(410, 380, "Sand dune")}${label(140, 270, "Wind")}`);

S.v3_3 = slide("Glaciers: U-shaped valleys", "Slow rivers of ice scrape valleys into a wide U shape (Himalayas)",
  `${sky()}<path d="M100,180 L300,180 C320,520 400,600 640,600 C880,600 960,520 980,180 L1180,180 L1180,650 L100,650 Z" fill="${C.rock}"/>
  <path d="M310,250 C330,500 420,560 640,560 C860,560 950,500 970,250 Z" fill="${C.ice}" stroke="#7dd3fc" stroke-width="4"/>
  ${label(640, 420, "Glacier (ice)")}${label(640, 630, "U-valley floor")}`);

S.v3_4 = slide("Sea waves: cliffs, caves and arches", "Waves attack rocky coasts; sand they drop makes beaches",
  `${sky()}<path d="M560,250 L1280,250 L1280,650 L560,650 Z" fill="${C.rockDark}"/>
  <path d="M760,650 L760,430 C760,360 900,360 900,430 L900,650 Z" fill="${C.sky}"/>
  <rect x="0" y="540" width="${W}" height="110" fill="${C.water}"/>
  ${[0, 1, 2, 3].map((i) => `<path d="M${40 + i * 140},540 q35,-30 70,0 t70,0" stroke="#fff" stroke-width="5" fill="none"/>`).join("")}
  <polygon points="0,600 300,560 300,650 0,650" fill="${C.sand}"/>
  ${label(830, 400, "Sea arch")}${label(1100, 300, "Cliff")}${label(160, 610, "Beach")}`);

S.v3_5 = slide("Groundwater: limestone caves", "Water dissolves limestone into caves: Borra Caves (Araku) and Belum Caves (AP)",
  `<rect x="0" y="90" width="${W}" height="560" fill="#57534e"/>
  <path d="M120,620 C120,260 380,170 640,170 C900,170 1160,260 1160,620 Z" fill="#292524"/>
  ${[300, 440, 600, 760, 920].map((x, i) => `<polygon points="${x - 18},${215 + (i % 2) * 10} ${x + 18},${215 + (i % 2) * 10} ${x},${330 + (i % 3) * 30}" fill="#e7e5e4"/>`).join("")}
  ${[360, 520, 690, 860].map((x, i) => `<polygon points="${x - 22},620 ${x + 22},620 ${x},${510 - (i % 2) * 40}" fill="#d6d3d1"/>`).join("")}
  ${label(600, 380, "Stalactite (hangs down)", { fill: C.ink })}${label(690, 470, "Stalagmite (grows up)", { fill: C.ink })}`);

S.v4_1 = slide("Plates push together: fold mountains", "The Indian plate pushes into Asia and keeps raising the Himalayas",
  `${sky()}<path d="M100,560 C250,560 300,330 420,330 C540,330 560,500 640,500 C720,500 740,260 860,260 C980,260 1030,560 1180,560 L1180,650 L100,650 Z" fill="${C.rock}"/>
  <path d="M100,600 C250,600 300,380 420,380 C540,380 560,550 640,550 C720,550 740,310 860,310 C980,310 1030,600 1180,600" stroke="${C.ground}" stroke-width="16" fill="none"/>
  ${arrow(60, 450, 260, 450, C.accent, 12)}${arrow(1220, 450, 1020, 450, C.accent, 12)}
  ${label(160, 410, "Indian plate")}${label(1120, 410, "Eurasian plate")}${label(860, 230, "Fold mountains")}`);

S.v4_2 = slide("Plates pull apart: rift valleys", "Land cracks and a block drops down; the Narmada flows in a rift valley",
  `${sky()}<polygon points="100,330 520,330 600,650 100,650" fill="${C.ground}"/><polygon points="760,330 1180,330 1180,650 680,650" fill="${C.ground}"/>
  <polygon points="520,430 760,430 680,650 600,650" fill="#b08968"/><rect x="560" y="410" width="160" height="22" fill="${C.water}"/>
  ${arrow(380, 280, 160, 280, C.accent, 10)}${arrow(900, 280, 1120, 280, C.accent, 10)}
  ${label(640, 390, "Rift valley")}${label(270, 245, "Pull apart")}${label(1010, 245, "Pull apart")}`);

S.v4_3 = slide("The geomorphic cycle · 1. Youth", "Steep slopes, deep V-valleys, waterfalls and fast rivers",
  `${sky()}<polygon points="140,640 420,190 640,560 860,190 1140,640" fill="${C.rock}"/>
  <path d="M640,560 L640,640" stroke="${C.water}" stroke-width="16"/><path d="M560,300 L560,420" stroke="${C.waterLight}" stroke-width="22"/>
  ${label(560, 270, "Waterfall")}${label(640, 520, "Deep V-valley")}`);

S.v4_4 = slide("The geomorphic cycle · 2. Maturity", "Valleys widen, hills become rounded, rivers begin to bend",
  `${sky()}<path d="M100,620 C220,330 380,330 500,520 C580,600 700,600 780,520 C900,330 1060,330 1180,620 Z" fill="${C.rock}"/>
  <rect x="100" y="600" width="1080" height="50" fill="${C.grass}"/>
  <path d="M520,560 C580,600 620,560 660,590 C700,620 740,580 770,560" stroke="${C.water}" stroke-width="12" fill="none"/>
  ${label(640, 500, "Wide valley")}${label(260, 300, "Rounded hill")}`);

S.v4_5 = slide("The geomorphic cycle · 3. Old age", "An almost flat plain (peneplain) with slow, winding rivers and ox-bow lakes",
  `${sky()}<path d="M0,560 C300,540 500,555 700,545 C900,535 1100,550 1280,540 L1280,650 L0,650 Z" fill="${C.grass}"/>
  <path d="M60,600 C200,560 260,640 400,600 C540,560 600,640 740,600 C880,560 940,640 1100,600" stroke="${C.water}" stroke-width="12" fill="none"/>
  <ellipse cx="760" cy="630" rx="50" ry="14" fill="none" stroke="${C.water}" stroke-width="8"/>
  ${label(400, 520, "Winding river")}${label(760, 600 - 20, "Ox-bow lake")}${label(1080, 480, "Flat plain")}`);

// Where the teacher points on each slide (fraction of width, height), matching the labels above.
const points = {
  v1_1: [0.23, 0.3], v1_2: [0.5, 0.26], v1_3: [0.67, 0.35], v1_4: [0.5, 0.45],
  v2_1: [0.47, 0.55], v2_2: [0.68, 0.62], v2_3: [0.5, 0.79], v2_4: [0.55, 0.68],
  v3_1: [0.28, 0.82], v3_2: [0.32, 0.65], v3_3: [0.5, 0.65], v3_4: [0.65, 0.66], v3_5: [0.47, 0.38],
  v4_1: [0.67, 0.4], v4_2: [0.5, 0.65], v4_3: [0.44, 0.5], v4_4: [0.5, 0.78], v4_5: [0.59, 0.86],
};

const manifest = {};
for (const [id, svg] of Object.entries(S)) {
  await sharp(Buffer.from(svg)).png().toFile(join(out, `${id}.png`));
  const video = id.split("_")[0];
  (manifest[video] ??= []).push({ slide: id, point: { x: points[id][0], y: points[id][1] } });
}
writeFileSync(join(here, "slides.json"), JSON.stringify(manifest, null, 2));
console.log(`Rendered ${Object.keys(S).length} slides into ${out}`);
