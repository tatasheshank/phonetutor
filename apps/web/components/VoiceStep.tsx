"use client";

import { getLanguage, resolveVoice, SPEECH_RATES, type LanguageCode, type SpeechRate, type VoiceOption } from "@ai-tutor/shared";
import { useEffect, useRef, useState } from "react";
import type { Strings } from "../lib/strings";

/**
 * Lets the learner hear each tutor voice and pick one, plus a speaking speed.
 * Clips are pre-generated (packages/shared/scripts/generate-voice-samples.ts) so listening costs nothing.
 */
export function VoiceStep({
  t,
  language,
  initialVoiceId,
  initialRate,
  onDone,
}: {
  t: Strings;
  language: LanguageCode;
  initialVoiceId?: string;
  initialRate?: SpeechRate;
  onDone: (voiceId: string, rate: SpeechRate) => void;
}) {
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

      <button
        className="btn"
        onClick={() => {
          audio.current?.pause();
          onDone(voiceId, rate);
        }}
      >
        {t.next}
      </button>
    </>
  );
}
