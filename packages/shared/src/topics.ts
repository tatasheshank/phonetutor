import type { LanguageCode } from "./languages";

/**
 * Teaching topics. A lesson's `course` field is its topic id; learners pick a topic first and then
 * a lesson in it, or just talk with the tutor about that topic.
 * Add a topic here to give it a proper name in every language; unknown ids still work (shown by slug).
 */
export interface Topic {
  id: string;
  emoji: string;
  name: Record<LanguageCode, string>;
  /** What the tutor teaches under this topic, in English, for the tutor's instructions. */
  about: string;
}

export const TOPICS: Topic[] = [
  {
    id: "phone-basics",
    emoji: "📱",
    name: { en: "Phone basics", te: "ఫోన్ వాడకం", hi: "फ़ोन चलाना" },
    about: "using a smartphone: calls, WhatsApp, the camera and settings, and staying safe from phone scams",
  },
  {
    id: "digital-payments",
    emoji: "💳",
    name: { en: "Safe payments", te: "సురక్షిత చెల్లింపులు", hi: "सुरक्षित भुगतान" },
    about: "paying safely with UPI apps and avoiding payment scams",
  },
  {
    id: "computer-basics",
    emoji: "💻",
    name: { en: "Computer basics", te: "కంప్యూటర్ వాడకం", hi: "कंप्यूटर चलाना" },
    about: "using a computer, including Excel and other office software",
  },
  {
    id: "earth-science",
    emoji: "🌍",
    name: { en: "Geography", te: "భూగోళ శాస్త్రం", hi: "भूगोल" },
    about: "geography and earth science, such as landforms, rivers, weathering and geomorphology",
  },
  {
    id: "class-10-biology",
    emoji: "🧬",
    name: { en: "Class 10 Biology", te: "10వ తరగతి జీవశాస్త్రం", hi: "कक्षा 10 जीव विज्ञान" },
    about: "Class 10 biology (AP State Board): life processes such as nutrition, respiration, transportation and excretion",
  },
];

/** Older lessons were saved with course "generated"; they are phone lessons. */
const ALIASES: Record<string, string> = { generated: "phone-basics" };

export function normalizeTopicId(id: string): string {
  return ALIASES[id] ?? id;
}

/** The topic for an id; unknown ids get a generic topic named from the slug ("excel-basics" → "Excel basics"). */
export function topicInfo(id: string): Topic {
  const key = normalizeTopicId(id);
  const known = TOPICS.find((t) => t.id === key);
  if (known) return known;
  const words = key.replace(/-/g, " ").trim() || "general";
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return { id: key, emoji: "📘", name: { en: label, te: label, hi: label }, about: words };
}

export function isTopicId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
}
