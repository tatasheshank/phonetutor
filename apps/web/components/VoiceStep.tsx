"use client";

import { getLanguage, resolveVoice, SPEECH_RATES, type LanguageCode, type SpeechRate, type VoiceOption } from "@ai-tutor/shared";
import { useEffect, useRef, useState } from "react";
import type { Strings } from "../lib/strings";
import { resolveLook, useTeacher, type TeacherLook } from "../lib/useTeacher";
import { Avatar } from "./Avatar";

/**
 * Lets the learner hear each tutor voice and pick one, plus a speaking speed.
 * Clips are pre-generated (packages/shared/scripts/generate-voice-samples.ts) so listening costs nothing.
 */
export function VoiceStep({
  t,
  language,
  initialVoiceId,
  initialRate,
  initialLook,
  onDone,
}: {
  t: Strings;
  language: LanguageCode;
  initialVoiceId?: string;
  initialRate?: SpeechRate;
  initialLook?: TeacherLook;
  onDone: (voiceId: string, rate: SpeechRate, look?: TeacherLook) => void;
}) {
  const teacher = useTeacher();
  const [look, setLook] = useState<TeacherLook | undefined>(initialLook);
  const shownLook = resolveLook(teacher, look);
  const still = useRef({ current: 0 });
  const lang = getLanguage(language);
  const [voiceId, setVoiceId] = useState(resolveVoice(lang, initialVoiceId).id);
  const [rate, setRate] = useState<SpeechRate>(initialRate ?? "normal");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  function play(v: VoiceOption, speed: SpeechRate = rate) {
    audio.current?.pause();
    const a = new Audio(`/voices/${language}/${v.id}.mp3`);
    // Browser playback speed approximates the real setting closely enough for a preview.
    a.playbackRate = SPEECH_RATES[speed];
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    audio.current = a;
    setPlaying(v.id);
    void a.play().catch(() => setPlaying(null));
  }

  const styleLabel = { friendly: t.styleFriendly, storyteller: t.styleStoryteller, classic: t.styleClassic };
  const chosen = resolveVoice(lang, voiceId);

  return (
    <>
      <h1>{t.voiceTitle}</h1>
      <p className="muted">{t.voiceHint}</p>

      <div className="stack" role="radiogroup" aria-label={t.voiceTitle}>
        {lang.voices.map((v) => {
          const isChosen = v.id === voiceId;
          return (
            <div key={v.id} className={`voice-card${isChosen ? " chosen" : ""}`}>
              <button
                className="voice-play"
                aria-label={`${t.listen}: ${v.name}`}
                onClick={() => (playing === v.id ? (audio.current?.pause(), setPlaying(null)) : play(v))}
              >
                {playing === v.id ? "❚❚" : "▶"}
              </button>
              <button
                className="voice-pick"
                role="radio"
                aria-checked={isChosen}
                aria-label={`${v.name}, ${styleLabel[v.style]}, ${v.gender === "male" ? t.male : t.female}`}
                onClick={() => {
                  setVoiceId(v.id);
                  play(v);
                }}
              >
                <span className="voice-name">{v.name}</span>
                <span className="voice-meta">
                  {styleLabel[v.style]} · {v.gender === "male" ? t.male : t.female}
                </span>
              </button>
              {isChosen && <span className="voice-check" aria-hidden>✓</span>}
            </div>
          );
        })}
      </div>

      <h2 className="voice-speed-title">{t.speedTitle}</h2>
      <div className="speed-row" role="radiogroup" aria-label={t.speedTitle}>
        {(["slow", "normal", "fast"] as const).map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={rate === r}
            className={`btn secondary speed${rate === r ? " chosen" : ""}`}
            onClick={() => {
              setRate(r);
              play(chosen, r);
            }}
          >
            {r === "slow" ? t.speedSlow : r === "normal" ? t.speedNormal : t.speedFast}
          </button>
        ))}
      </div>

      {teacher && (
        <>
          <h2 className="voice-speed-title">{t.lookTitle}</h2>
          <div className="look-row" role="radiogroup" aria-label={t.lookTitle}>
            {([...(teacher.liveAvailable ? (["live"] as const) : []), ...(teacher.photoUrl ? (["photo"] as const) : []), "drawing", "man"] as const).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={shownLook === l}
                className={`btn secondary look-card${shownLook === l ? " chosen" : ""}`}
                onClick={() => setLook(l)}
              >
                {l === "live" ? (
                  <span className="look-live" aria-hidden>
                    🎥
                  </span>
                ) : (
                  <Avatar state="neutral" level={still.current} look={l} photoUrl={teacher.photoUrl} />
                )}
                <span>{l === "live" ? t.lookLive : l === "photo" ? t.lookPhoto : l === "man" ? t.lookMan : t.lookDrawing}</span>
              </button>
            ))}
          </div>
          {((shownLook === "man" && chosen.gender === "female") || (shownLook === "drawing" && chosen.gender === "male")) && (
            <p className="muted small">{shownLook === "man" ? t.lookVoiceTipMan : t.lookVoiceTipWoman}</p>
          )}
        </>
      )}

      <button
        className="btn"
        onClick={() => {
          audio.current?.pause();
          onDone(voiceId, rate, teacher ? shownLook : look);
        }}
      >
        {t.next}
      </button>
    </>
  );
}
