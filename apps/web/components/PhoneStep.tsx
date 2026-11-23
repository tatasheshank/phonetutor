import type { LanguageCode } from "@ai-tutor/shared";
import type { Strings } from "../lib/strings";

/** Labels as WhatsApp shows them, per phone language. Used only for this picture. */
const WA_LABELS: Record<LanguageCode, { title: string; tabs: [string, string, string]; chat: string }> = {
  en: { title: "WhatsApp", tabs: ["Chats", "Updates", "Calls"], chat: "Ravi: Video call?" },
  te: { title: "WhatsApp", tabs: ["చాట్‌లు", "అప్‌డేట్‌లు", "కాల్స్"], chat: "రవి: వీడియో కాల్?" },
  hi: { title: "WhatsApp", tabs: ["चैट", "अपडेट", "कॉल"], chat: "रवि: वीडियो कॉल?" },
};

/**
 * Asks which language the learner's real phone uses, by showing pictures, not words.
 * Practice screens later use this language for their labels.
 */
export function PhoneStep({
  t,
  tutorLanguage,
  onPick,
}: {
  t: Strings;
  tutorLanguage: LanguageCode;
  onPick: (code: LanguageCode) => void;
}) {
  // Most learners' phones are in English or their own language.
  const options: LanguageCode[] = tutorLanguage === "en" ? ["en", "te", "hi"] : ["en", tutorLanguage];

  return (
    <>
      <h1>{t.phoneQuestion}</h1>
      <p className="muted">{t.phoneHint}</p>
      <div className="stack">
        {options.map((code) => {
          const w = WA_LABELS[code];
          return (
            <button key={code} className="btn secondary" onClick={() => onPick(code)} aria-label={w.tabs.join(" ")}>
              <div className="phone" lang={code}>
                <div className="bar">{w.title}</div>
                <div className="tabs">
                  {w.tabs.map((tab) => (
                    <span key={tab}>{tab}</span>
                  ))}
                </div>
                <div className="chat">{w.chat}</div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
