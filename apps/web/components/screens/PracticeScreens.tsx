"use client";

import type { LanguageCode } from "@ai-tutor/shared";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Simulated phone screens for practice. Generic messaging-app styling (not a copy of the real app),
 * with labels in the learner's phone language. Every tappable part carries a `data-target` id that
 * matches packages/shared/src/screens/manifest.ts exactly; lessons refer to those ids.
 */

interface StageCtx {
  highlight: string | null;
  flash: { target: string; ok: boolean } | null;
  /** The button the teacher is pressing right now (press animation). */
  pressed?: string | null;
  /** Null = watch-only: the learner can't operate the phone. */
  onTap: ((target: string) => void) | null;
}
const Ctx = createContext<StageCtx>({ highlight: null, flash: null, pressed: null, onTap: null });

export function ScreenProvider({ value, children }: { value: StageCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** A tappable element. Big hit area; highlighted with a pulsing ring when the tutor points at it. */
function Target({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  const { highlight, flash, pressed, onTap } = useContext(Ctx);
  const state = flash?.target === id ? (flash.ok ? " tap-ok" : " tap-wrong") : "";
  return (
    <button
      type="button"
      data-target={id}
      aria-label={label}
      tabIndex={onTap ? 0 : -1}
      aria-disabled={onTap ? undefined : true}
      className={`target ${className ?? ""}${highlight === id ? " hl" : ""}${pressed === id ? " pressing" : ""}${state}`}
      onClick={onTap ? () => onTap(id) : undefined}
    >
      {children}
    </button>
  );
}

const L: Record<
  LanguageCode,
  {
    app: string;
    tabs: [string, string, string];
    son: string;
    sonLast: string;
    family: string;
    familyLast: string;
    newChat: string;
    online: string;
    message: string;
    typeMessage: string;
    send: string;
    mic: string;
    back: string;
    videoCall: string;
    voiceCall: string;
    calling: string;
    end: string;
    flip: string;
    mute: string;
    cameraOff: string;
  }
> = {
  en: {
    app: "WhatsApp",
    tabs: ["Chats", "Updates", "Calls"],
    son: "Ravi (son)",
    sonLast: "Amma, are you free to talk?",
    family: "Family",
    familyLast: "Lakshmi: Good morning 🌞",
    newChat: "New chat",
    online: "online",
    message: "Amma, are you free to talk?",
    typeMessage: "Message",
    send: "Send",
    mic: "Voice message",
    back: "Back",
    videoCall: "Video call",
    voiceCall: "Voice call",
    calling: "Video calling…",
    end: "End",
    flip: "Flip",
    mute: "Mute",
    cameraOff: "Camera off",
  },
  te: {
    app: "WhatsApp",
    tabs: ["చాట్‌లు", "అప్‌డేట్‌లు", "కాల్స్"],
    son: "రవి (అబ్బాయి)",
    sonLast: "అమ్మా, మాట్లాడటానికి ఖాళీగా ఉన్నావా?",
    family: "కుటుంబం",
    familyLast: "లక్ష్మి: శుభోదయం 🌞",
    newChat: "కొత్త చాట్",
    online: "ఆన్‌లైన్",
    message: "అమ్మా, మాట్లాడటానికి ఖాళీగా ఉన్నావా?",
    typeMessage: "సందేశం",
    send: "పంపు",
    mic: "వాయిస్ మెసేజ్",
    back: "వెనక్కి",
    videoCall: "వీడియో కాల్",
    voiceCall: "వాయిస్ కాల్",
    calling: "వీడియో కాల్ చేస్తోంది…",
    end: "ముగించు",
    flip: "మార్చు",
    mute: "మ్యూట్",
    cameraOff: "కెమెరా ఆఫ్",
  },
  hi: {
    app: "WhatsApp",
    tabs: ["चैट", "अपडेट", "कॉल"],
    son: "रवि (बेटा)",
    sonLast: "माँ, बात करने का समय है?",
    family: "परिवार",
    familyLast: "लक्ष्मी: सुप्रभात 🌞",
    newChat: "नई चैट",
    online: "ऑनलाइन",
    message: "माँ, बात करने का समय है?",
    typeMessage: "मैसेज",
    send: "भेजें",
    mic: "वॉइस मैसेज",
    back: "वापस",
    videoCall: "वीडियो कॉल",
    voiceCall: "वॉइस कॉल",
    calling: "वीडियो कॉल हो रही है…",
    end: "काटें",
    flip: "बदलें",
    mute: "म्यूट",
    cameraOff: "कैमरा बंद",
  },
};

// Simple generic icons (inline SVG, currentColor).
const Icon = {
  camera: (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <rect x="2" y="6" width="14" height="12" rx="3" fill="currentColor" />
      <path d="M16 10l6-3v10l-6-3z" fill="currentColor" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <path
        d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.6 3.6a1 1 0 01-.25 1z"
        fill="currentColor"
      />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M3 20l18-8L3 4l2 7 9 1-9 1z" fill="currentColor" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0012 0M12 17v4" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  flip: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <path d="M4 12a8 8 0 0114-5l2-2v6h-6l2-2a5 5 0 00-9 3M20 12a8 8 0 01-14 5l-2 2v-6h6l-2 2a5 5 0 009-3" fill="currentColor" />
    </svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  ),
  camOff: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <rect x="2" y="6" width="14" height="12" rx="3" fill="currentColor" />
      <path d="M3 3l18 18" stroke="#fff" strokeWidth="2.2" />
    </svg>
  ),
};

function Avatar({ letter, color }: { letter: string; color: string }) {
  return (
    <span className="ps-avatar" style={{ background: color }} aria-hidden>
      {letter}
    </span>
  );
}

export function ChatsScreen({ lang }: { lang: LanguageCode }) {
  const t = L[lang];
  return (
    <div className="ps" lang={lang}>
      <div className="ps-bar">
        <span className="ps-title">{t.app}</span>
      </div>
      <div className="ps-tabs">
        <span className="active">{t.tabs[0]}</span>
        <span>{t.tabs[1]}</span>
        <Target id="tab.calls" label={t.tabs[2]} className="ps-tab-btn">
          {t.tabs[2]}
        </Target>
      </div>
      <div className="ps-list">
        <Target id="row.beta" label={t.son} className="ps-row">
          <Avatar letter={t.son.slice(0, 1)} color="#7c3aed" />
          <span className="ps-row-text">
            <strong>{t.son}</strong>
            <small>{t.sonLast}</small>
          </span>
          <span className="ps-time">10:42</span>
        </Target>
        <Target id="row.family" label={t.family} className="ps-row">
          <Avatar letter={t.family.slice(0, 1)} color="#ea580c" />
          <span className="ps-row-text">
            <strong>{t.family}</strong>
            <small>{t.familyLast}</small>
          </span>
          <span className="ps-time">08:05</span>
        </Target>
      </div>
      <Target id="btn.newChat" label={t.newChat} className="ps-fab">
        {Icon.plus}
      </Target>
    </div>
  );
}

export function ChatScreen({ lang }: { lang: LanguageCode }) {
  const t = L[lang];
  return (
    <div className="ps" lang={lang}>
      <div className="ps-bar ps-chat-bar">
        <Target id="btn.back" label={t.back} className="ps-icon-btn">
          {Icon.back}
        </Target>
        <Avatar letter={t.son.slice(0, 1)} color="#7c3aed" />
        <span className="ps-chat-name">
          <strong>{t.son}</strong>
          <small>{t.online}</small>
        </span>
        <Target id="btn.videoCall" label={t.videoCall} className="ps-icon-btn">
          {Icon.camera}
        </Target>
        <Target id="btn.voiceCall" label={t.voiceCall} className="ps-icon-btn">
          {Icon.phone}
        </Target>
      </div>
      <div className="ps-messages">
        <div className="ps-bubble">
          {t.message}
          <small>10:42</small>
        </div>
      </div>
      <div className="ps-compose">
        <Target id="input.message" label={t.typeMessage} className="ps-input">
          {t.typeMessage}
        </Target>
        <Target id="btn.mic" label={t.mic} className="ps-round">
          {Icon.mic}
        </Target>
        <Target id="btn.send" label={t.send} className="ps-round">
          {Icon.send}
        </Target>
      </div>
    </div>
  );
}

export function CallScreen({ lang }: { lang: LanguageCode }) {
  const t = L[lang];
  return (
    <div className="ps ps-call" lang={lang}>
      <div className="ps-call-top">
        <Avatar letter={t.son.slice(0, 1)} color="#7c3aed" />
        <strong>{t.son}</strong>
        <small>{t.calling}</small>
      </div>
      <div className="ps-call-self" aria-hidden />
      <div className="ps-call-actions">
        <Target id="btn.switchCamera" label={t.flip} className="ps-call-btn">
          {Icon.flip}
          <small>{t.flip}</small>
        </Target>
        <Target id="btn.cameraOff" label={t.cameraOff} className="ps-call-btn">
          {Icon.camOff}
          <small>{t.cameraOff}</small>
        </Target>
        <Target id="btn.mute" label={t.mute} className="ps-call-btn">
          {Icon.mute}
          <small>{t.mute}</small>
        </Target>
        <Target id="btn.endCall" label={t.end} className="ps-call-btn ps-end">
          {Icon.phone}
          <small>{t.end}</small>
        </Target>
      </div>
    </div>
  );
}

export const SCREENS: Record<string, (p: { lang: LanguageCode }) => React.ReactElement> = {
  "wa.chats": ChatsScreen,
  "wa.chat": ChatScreen,
  "wa.call": CallScreen,
};
