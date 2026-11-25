// Builds the "Fundamentals of Geomorphology" video lesson exactly as an admin upload would store it:
//   - clips -> data/lesson-media/<lessonId>/clip-01.mp4 ... (served at /api/lesson-media/<lessonId>/...)
//   - lesson -> content/lessons/<lessonId>.json (draft packs in en, te, hi; visible in Admin → Lessons)
// Pointer positions come from slides.json; each slide lasts 7 s, so cue n starts at (n-1)*7 s.
//   npx tsx content/source/geomorphology/build-lesson.ts
import { locateMedia, validateLesson } from "@ai-tutor/shared";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const root = resolve(here, "../../..");
const LESSON_ID = "fundamentals-of-geomorphology-5e0b17";
const SLIDE_SECONDS = 7;
const slides = JSON.parse(readFileSync(join(here, "slides.json"), "utf8")) as Record<string, Array<{ point: { x: number; y: number } }>>;
const files = { v1: "geo-v1-forces.mp4", v2: "geo-v2-processes.mp4", v3: "geo-v3-agents.mp4", v4: "geo-v4-plates-cycle.mp4" } as const;
const labels = { v1: "Forces that shape the land", v2: "Break, move, drop", v3: "Five agents and their landforms", v4: "Plates and the geomorphic cycle" };

type Lang = "en" | "te" | "hi";
const T: Record<Lang, {
  title: string; intro: string; summary: string;
  v: Record<keyof typeof files, string[]>; checks: string[]; accept: string[];
}> = {
  en: {
    title: "Fundamentals of Geomorphology",
    intro: "Today we will learn geomorphology: how the shapes of the land are made, and how they change.",
    v: {
      v1: [
        "Geomorphology is the study of landforms, like mountains, valleys, plains and deltas, and of how they are made and changed.",
        "Endogenic forces come from inside the Earth. Its heat pushes land up, making volcanoes, earthquakes and rising mountains.",
        "Exogenic forces work on the surface. The sun, rain, rivers, wind, ice and waves slowly wear the land down.",
        "Every landform is a tug-of-war: forces inside push land up, and forces outside wear it down.",
      ],
      v2: [
        "First, weathering. Heat and cold, water, chemicals and plant roots crack the rock, but the pieces stay where they are.",
        "Then gravity pulls loose rock and soil downhill. Landslides in the Western Ghats during the monsoon are an example.",
        "Next, erosion and transport. An agent, like this river, picks up the broken pieces and carries them away.",
        "Finally, deposition. When the river slows down at the sea, it drops the sediment and builds new land, called a delta.",
      ],
      v3: [
        "Rivers cut V-shaped valleys in hills. On flat land they bend into meanders and leave ox-bow lakes, and at the sea they build deltas, like the Godavari and Krishna.",
        "In deserts like the Thar, wind piles sand into crescent-shaped dunes.",
        "Glaciers are slow rivers of ice. They scrape valleys into a wide U shape. Remember: V for river, U for glacier.",
        "Sea waves attack rocky coasts and carve cliffs, caves and arches. The sand they drop makes beaches.",
        "Underground water dissolves limestone and makes caves, like the Borra Caves near Araku and the Belum Caves in Andhra Pradesh. Stalactites hang down; stalagmites grow up.",
      ],
      v4: [
        "The Earth's surface is made of huge plates. When they push together, rock folds up into mountains. The Indian plate is still raising the Himalayas.",
        "When plates pull apart, the land cracks and a block drops down, making a rift valley. The Narmada river flows through one.",
        "A raised landscape wears down in stages. In youth, slopes are steep, valleys are deep V shapes, and rivers make waterfalls.",
        "In maturity, valleys widen, hills become rounded and rivers begin to bend.",
        "In old age, the land is almost flat, with slow, winding rivers and ox-bow lakes.",
      ],
    },
    checks: [
      "Is a volcano made by a force from inside the Earth?",
      "When a river drops sand at the sea, is that called deposition?",
      "Does a glacier make a U-shaped valley?",
      "Is a river with waterfalls and a deep V-valley in its youth stage?",
    ],
    accept: ["yes", "yes it is", "yes it does", "ok", "okay", "right", "correct", "haan"],
    summary: "Today we learned: forces inside lift the land, forces outside wear it down. Break, move, drop. Rivers, wind, ice, waves and groundwater each make their own landforms. Well done!",
  },
  te: {
    title: "జియోమార్ఫాలజీ ప్రాథమిక అంశాలు",
    intro: "ఈ రోజు మనం జియోమార్ఫాలజీ గురించి నేర్చుకుందాం. అంటే భూమి ఆకారాలు ఎలా ఏర్పడతాయో, ఎలా మారుతాయో తెలుసుకోవడం.",
    v: {
      v1: [
        "జియోమార్ఫాలజీ అంటే పర్వతాలు, లోయలు, మైదానాలు, డెల్టాలు వంటి భూస్వరూపాల గురించి, అవి ఎలా ఏర్పడతాయో, ఎలా మారుతాయో చదివే శాస్త్రం.",
        "ఎండోజెనిక్ శక్తులు భూమి లోపలి నుంచి వస్తాయి. భూమి లోపలి వేడి నేలను పైకి నెడుతుంది. అగ్నిపర్వతాలు, భూకంపాలు, పెరిగే పర్వతాలు వీటి వల్లే.",
        "ఎక్సోజెనిక్ శక్తులు భూమి ఉపరితలంపై పనిచేస్తాయి. ఎండ, వాన, నదులు, గాలి, మంచు, అలలు నెమ్మదిగా నేలను అరగదీస్తాయి.",
        "ప్రతి భూస్వరూపం ఒక తాడు లాగుడు ఆట లాంటిది. లోపలి శక్తులు నేలను పైకి లేపుతాయి, బయటి శక్తులు కిందకు అరగదీస్తాయి.",
      ],
      v2: [
        "మొదట వెదరింగ్. వేడి, చలి, నీరు, రసాయనాలు, మొక్కల వేర్లు రాయిని పగలగొడతాయి. కానీ ముక్కలు అక్కడే ఉంటాయి.",
        "తర్వాత గురుత్వాకర్షణ వదులైన రాళ్లను, మట్టిని కిందకు లాగుతుంది. వర్షాకాలంలో పశ్చిమ కనుమల్లో కొండచరియలు విరిగిపడటం దీనికి ఉదాహరణ.",
        "తర్వాత ఎరోజన్, ట్రాన్స్‌పోర్ట్. ఈ నది లాంటి ఒక శక్తి పగిలిన ముక్కలను తీసుకుని దూరంగా మోసుకెళ్తుంది.",
        "చివరగా డిపాజిషన్. నది సముద్రం దగ్గర నెమ్మదించినప్పుడు, మోసుకొచ్చిన మట్టిని అక్కడే వదిలేసి కొత్త నేలను, అంటే డెల్టాను, ఏర్పరుస్తుంది.",
      ],
      v3: [
        "నదులు కొండల్లో V ఆకారపు లోయలను కోస్తాయి. చదునైన నేలపై వంకరలు తిరుగుతూ ఆక్స్-బౌ సరస్సులను వదులుతాయి. సముద్రం దగ్గర గోదావరి, కృష్ణా లాగా డెల్టాలను ఏర్పరుస్తాయి.",
        "థార్ ఎడారి లాంటి ఎడారుల్లో గాలి ఇసుకను నెలవంక ఆకారపు దిబ్బలుగా పోగు చేస్తుంది.",
        "హిమానీనదాలు అంటే నెమ్మదిగా కదిలే మంచు నదులు. ఇవి లోయలను వెడల్పాటి U ఆకారంలో గీకుతాయి. గుర్తుంచుకోండి: నదికి V, హిమానీనదానికి U.",
        "సముద్రపు అలలు రాతి తీరాలను కొట్టి నిటారు కొండలు, గుహలు, ఆర్చ్‌లను చెక్కుతాయి. అవి వదిలే ఇసుక బీచ్‌లుగా మారుతుంది.",
        "భూగర్భ జలం సున్నపురాయిని కరిగించి గుహలను ఏర్పరుస్తుంది. అరకు దగ్గర బొర్రా గుహలు, ఆంధ్రప్రదేశ్‌లోని బెలూం గుహలు దీనికి ఉదాహరణలు. స్టాలక్టైట్‌లు పై నుంచి వేలాడతాయి, స్టాలగ్మైట్‌లు కింద నుంచి పెరుగుతాయి.",
      ],
      v4: [
        "భూమి ఉపరితలం పెద్ద పెద్ద ప్లేట్లతో ఏర్పడింది. అవి ఒకదానినొకటి నెట్టుకున్నప్పుడు రాయి మడతలు పడి పర్వతాలు లేస్తాయి. భారత ప్లేట్ ఇప్పటికీ హిమాలయాలను పైకి లేపుతోంది.",
        "ప్లేట్లు దూరంగా జరిగినప్పుడు నేల పగిలి ఒక భాగం కిందకు దిగుతుంది. దాన్ని రిఫ్ట్ లోయ అంటారు. నర్మదా నది అలాంటి లోయలో ప్రవహిస్తుంది.",
        "ఎత్తైన భూభాగం దశలవారీగా అరిగిపోతుంది. యవ్వన దశలో వాలులు నిటారుగా, లోయలు లోతైన V ఆకారంలో ఉంటాయి, నదులు జలపాతాలను ఏర్పరుస్తాయి.",
        "పరిపక్వ దశలో లోయలు వెడల్పవుతాయి, కొండలు గుండ్రంగా మారుతాయి, నదులు వంకర తిరగడం మొదలుపెడతాయి.",
        "వృద్ధాప్య దశలో నేల దాదాపు చదునుగా మారుతుంది. నెమ్మదిగా వంకరలు తిరిగే నదులు, ఆక్స్-బౌ సరస్సులు కనిపిస్తాయి.",
      ],
    },
    checks: [
      "అగ్నిపర్వతం భూమి లోపలి శక్తి వల్ల ఏర్పడుతుందా?",
      "నది సముద్రం దగ్గర ఇసుకను వదిలేయడాన్ని డిపాజిషన్ అంటారా?",
      "హిమానీనదం U ఆకారపు లోయను ఏర్పరుస్తుందా?",
      "జలపాతాలు, లోతైన V లోయ ఉన్న నది యవ్వన దశలో ఉంటుందా?",
    ],
    accept: ["అవును", "ఔను", "అవునండి", "హా", "yes", "ok", "haan"],
    summary: "ఈ రోజు నేర్చుకున్నది: లోపలి శక్తులు నేలను లేపుతాయి, బయటి శక్తులు అరగదీస్తాయి. పగలడం, కదలడం, వదలడం. నదులు, గాలి, మంచు, అలలు, భూగర్భ జలం ఒక్కొక్కటి తమ సొంత భూస్వరూపాలను చేస్తాయి. చాలా బాగా చేశారు!",
  },
  hi: {
    title: "जियोमॉर्फोलॉजी के मूल सिद्धांत",
    intro: "आज हम जियोमॉर्फोलॉजी सीखेंगे, यानी धरती के आकार कैसे बनते हैं और कैसे बदलते हैं।",
    v: {
      v1: [
        "जियोमॉर्फोलॉजी वह विज्ञान है जो पहाड़, घाटियाँ, मैदान और डेल्टा जैसे भू-आकारों का अध्ययन करता है, और यह कि वे कैसे बनते और बदलते हैं।",
        "एंडोजेनिक बल धरती के अंदर से आते हैं। अंदर की गर्मी ज़मीन को ऊपर धकेलती है, जिससे ज्वालामुखी, भूकंप और ऊँचे होते पहाड़ बनते हैं।",
        "एक्सोजेनिक बल सतह पर काम करते हैं। धूप, बारिश, नदियाँ, हवा, बर्फ़ और लहरें धीरे-धीरे ज़मीन को घिसती हैं।",
        "हर भू-आकार एक रस्साकशी जैसा है। अंदर के बल ज़मीन को ऊपर उठाते हैं, बाहर के बल उसे नीचे घिसते हैं।",
      ],
      v2: [
        "पहला, अपक्षय यानी वेदरिंग। गर्मी, ठंड, पानी, रसायन और पौधों की जड़ें चट्टान को तोड़ती हैं, पर टुकड़े वहीं रहते हैं।",
        "फिर गुरुत्वाकर्षण ढीली चट्टान और मिट्टी को नीचे खींचता है। मानसून में पश्चिमी घाट में भूस्खलन इसका उदाहरण है।",
        "फिर अपरदन और परिवहन। यह नदी जैसा कोई कारक टूटे टुकड़ों को उठाकर दूर ले जाता है।",
        "आख़िर में निक्षेपण यानी डिपॉज़िशन। समुद्र के पास नदी धीमी होकर मिट्टी छोड़ देती है और नई ज़मीन, यानी डेल्टा, बनाती है।",
      ],
      v3: [
        "नदियाँ पहाड़ों में V आकार की घाटियाँ काटती हैं। समतल ज़मीन पर वे मोड़ बनाती हैं और ऑक्सबो झीलें छोड़ती हैं, और समुद्र के पास गोदावरी और कृष्णा जैसे डेल्टा बनाती हैं।",
        "थार जैसे रेगिस्तान में हवा रेत को अर्धचंद्र आकार के टीलों में जमा करती है।",
        "हिमनद यानी ग्लेशियर बर्फ़ की धीमी नदियाँ हैं। वे घाटियों को चौड़े U आकार में घिसते हैं। याद रखिए: नदी का V, ग्लेशियर का U।",
        "समुद्र की लहरें चट्टानी तट से टकराकर खड़ी चट्टानें, गुफाएँ और मेहराब बनाती हैं। उनकी छोड़ी रेत से समुद्र तट बनते हैं।",
        "भूजल चूना पत्थर को घोलकर गुफाएँ बनाता है, जैसे अराकू के पास बोर्रा गुफाएँ और आंध्र प्रदेश की बेलम गुफाएँ। स्टैलेक्टाइट ऊपर से लटकते हैं, स्टैलेग्माइट नीचे से उगते हैं।",
      ],
      v4: [
        "धरती की सतह बड़ी-बड़ी प्लेटों से बनी है। जब वे आपस में टकराती हैं, चट्टान मुड़कर पहाड़ बनती है। भारतीय प्लेट आज भी हिमालय को ऊपर उठा रही है।",
        "जब प्लेटें दूर खिसकती हैं, ज़मीन फटती है और एक हिस्सा नीचे धँस जाता है। इसे भ्रंश घाटी यानी रिफ्ट वैली कहते हैं। नर्मदा नदी ऐसी ही घाटी में बहती है।",
        "ऊँची ज़मीन चरणों में घिसती है। युवा अवस्था में ढलान खड़ी होती हैं, घाटियाँ गहरी V आकार की होती हैं और नदियाँ जलप्रपात बनाती हैं।",
        "प्रौढ़ अवस्था में घाटियाँ चौड़ी होती हैं, पहाड़ियाँ गोल हो जाती हैं और नदियाँ मुड़ने लगती हैं।",
        "वृद्धावस्था में ज़मीन लगभग समतल हो जाती है, और धीमी घुमावदार नदियाँ और ऑक्सबो झीलें दिखती हैं।",
      ],
    },
    checks: [
      "क्या ज्वालामुखी धरती के अंदर के बल से बनता है?",
      "जब नदी समुद्र के पास रेत छोड़ती है, क्या उसे डिपॉज़िशन कहते हैं?",
      "क्या ग्लेशियर U आकार की घाटी बनाता है?",
      "क्या जलप्रपात और गहरी V घाटी वाली नदी युवा अवस्था में होती है?",
    ],
    accept: ["हाँ", "जी", "हाँ जी", "जी हाँ", "yes", "ok", "haan"],
    summary: "आज हमने सीखा: अंदर के बल ज़मीन उठाते हैं, बाहर के बल घिसते हैं। टूटना, बहना, जमा होना। नदी, हवा, बर्फ़, लहरें और भूजल अपने-अपने भू-आकार बनाते हैं। बहुत बढ़िया!",
  },
};

// ---- steps (shared structure) ----
const steps: unknown[] = [{ id: "s1", type: "say", avatar: "smile" }];
const order = ["v1", "v2", "v3", "v4"] as const;
order.forEach((v, i) => {
  const clip = `clip-${String(i + 1).padStart(2, "0")}.mp4`;
  steps.push({
    id: `s${2 + i * 2}`,
    type: "video",
    source: { kind: "upload", src: `/api/lesson-media/${LESSON_ID}/${clip}` },
    label: `${files[v]} · ${labels[v]}`,
    cues: slides[v]!.map((s, n) => ({ at: n * SLIDE_SECONDS, point: s.point, pause: true })),
  });
  steps.push({ id: `s${3 + i * 2}`, type: "check", tapFallback: ["yes", "no"] });
});
steps.push({ id: "s10", type: "say", avatar: "smile" });

// ---- per-language packs ----
const locales: Record<string, unknown> = {};
for (const lang of ["en", "te", "hi"] as Lang[]) {
  const t = T[lang];
  const ps: Record<string, unknown> = { s1: { text: t.intro }, s10: { text: t.summary } };
  order.forEach((v, i) => {
    ps[`s${2 + i * 2}`] = { cues: t.v[v].map((text) => ({ text })) };
    ps[`s${3 + i * 2}`] = { question: t.checks[i], accept: t.accept };
  });
  locales[lang] = { status: "draft", title: t.title, steps: ps, quiz: {}, neverSay: [] };
}

const lesson = {
  id: LESSON_ID,
  version: 1,
  course: "earth-science",
  mode: "scripted",
  objectives: [
    "Say what geomorphology studies",
    "Tell endogenic forces from exogenic forces",
    "Explain weathering, erosion, transport and deposition",
    "Name the five agents and one landform each makes",
    "Describe fold mountains, rift valleys and the geomorphic cycle",
  ],
  screens: [],
  interruptions: { enabled: true, maxLiveTurns: 8, maxLiveSeconds: 180 },
  steps,
  quiz: [],
  knowledge: [],
  safety: { neverSay: [] },
  locales,
};

// ---- copy clips like an upload would, then validate (including that the media exists) ----
const mediaDir = join(root, "data", "lesson-media", LESSON_ID);
mkdirSync(mediaDir, { recursive: true });
order.forEach((v, i) => copyFileSync(join(here, "videos", files[v]), join(mediaDir, `clip-${String(i + 1).padStart(2, "0")}.mp4`)));

const result = validateLesson(lesson, {
  mediaExists: (src: string) => {
    const loc = locateMedia(src);
    if (!loc) return false;
    return loc.root === "uploads"
      ? existsSync(join(root, "data", "lesson-media", loc.lessonId, loc.file))
      : existsSync(join(root, "apps/web/public", loc.path));
  },
});
// Draft packs aren't "playable" by design; anything else is a real problem.
const problems = result.errors.filter((e) => !e.startsWith("locales: a scripted lesson needs"));
if (problems.length) {
  console.error("Lesson has problems:\n  " + problems.join("\n  "));
  process.exit(1);
}
writeFileSync(join(root, "content", "lessons", `${LESSON_ID}.json`), JSON.stringify(lesson, null, 2) + "\n");
console.log(`Saved content/lessons/${LESSON_ID}.json and 4 clips in data/lesson-media/${LESSON_ID}/`);
console.log(`Steps: ${steps.length} · cues: ${order.map((v) => slides[v]!.length).join("+")} · languages: en, te, hi (draft)`);
