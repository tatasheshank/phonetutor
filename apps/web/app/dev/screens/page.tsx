"use client";

import { nextScreen, SCREEN_MANIFEST, type ClientEvent, type LanguageCode } from "@ai-tutor/shared";
import { notFound } from "next/navigation";
import { useState } from "react";
import { Avatar } from "../../../components/Avatar";
import { LessonStage, type StageState } from "../../../components/LessonStage";
import { contactForTap, type Contact } from "../../../components/screens/PracticeScreens";
import { strings } from "../../../lib/strings";

/**
 * Development-only preview of the teacher's demo phone: pick a screen and a button to point at,
 * then let the teacher press it. Not available in production builds.
 */
export default function ScreensPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  const screens = Object.keys(SCREEN_MANIFEST) as Array<keyof typeof SCREEN_MANIFEST>;
  const [screen, setScreen] = useState<string>("wa.chat");
  const [lang, setLang] = useState<LanguageCode>("te");
  const [highlight, setHighlight] = useState<string | null>("btn.videoCall");
  const [pressed, setPressed] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact>("son");
  const [showCheck, setShowCheck] = useState(false);
  const [pointAt, setPointAt] = useState<{ x: number; y: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const targets = (SCREEN_MANIFEST[screen as keyof typeof SCREEN_MANIFEST]?.targets ?? []) as readonly string[];

  const stage: StageState = {
    screen,
    highlight,
    pressed,
    contact,
    check: showCheck ? { stepId: "c", question: strings(lang).chooseLesson + "?", options: ["yes", "no"] } : null,
  };
  const send = (e: ClientEvent) => setLog((l) => [JSON.stringify(e), ...l].slice(0, 6));

  // Same as a "tap" event in a lesson: show the press, then move to the next screen.
  function teacherPress() {
    if (!highlight) return;
    const target = highlight;
    setPressed(target);
    setTimeout(() => {
      setPressed(null);
      setHighlight(null);
      setScreen((s) => nextScreen(s, target) ?? s);
      setContact((c) => contactForTap(target) ?? c);
    }, 650);
  }

  return (
    <main lang="en" style={{ maxWidth: 520 }}>
      <h1>Teacher demo phone (dev preview)</h1>
      <div className="row">
        <label className="field">
          <span>Screen</span>
          <select
            value={screen}
            onChange={(e) => {
              setScreen(e.target.value);
              setHighlight(null);
            }}
          >
            {screens.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Phone language</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)}>
            <option value="te">te</option>
            <option value="hi">hi</option>
            <option value="en">en</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Teacher points at</span>
        <select value={highlight ?? ""} onChange={(e) => setHighlight(e.target.value || null)}>
          <option value="">(nothing)</option>
          {targets.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <button className="btn" disabled={!highlight} onClick={teacherPress}>
        👆 Teacher presses it
      </button>
      <label className="check">
        <input type="checkbox" checked={showCheck} onChange={(e) => setShowCheck(e.target.checked)} />
        <span>Show a check question</span>
      </label>
      <LessonStage stage={stage} screenLanguage={lang} t={strings(lang)} send={send} onPointScreen={setPointAt} board />
      <div className="teach-row">
        <div className="teach-avatar">
          <Avatar state="speaking" level={{ current: 0 }} pointAt={pointAt} />
        </div>
        <p className="status">{strings(lang).speaking}</p>
      </div>
      <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }} aria-label="Events sent">
        {log.join("\n")}
      </pre>
    </main>
  );
}
