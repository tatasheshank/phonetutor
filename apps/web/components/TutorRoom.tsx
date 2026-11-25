"use client";

import {
  DATA_TOPIC,
  decodeEvent,
  encodeEvent,
  type AgentEvent,
  type AvatarState,
  type ClientEvent,
  type LanguageCode,
  type SpeechRate,
  TOPICS,
  topicInfo,
} from "@ai-tutor/shared";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fill, type Strings } from "../lib/strings";
import type { Me } from "./LoginStep";
import { Avatar } from "./Avatar";
import { afterPress, emptyStage, startPress, LessonStage, type StageState } from "./LessonStage";
import { Board, type BoardState } from "./Board";
import { reportVideoError } from "./reportVideoError";

type Phase =
  | "ready"
  | "connecting"
  | "live"
  | "ended"
  | "error"
  | "payment_required"
  | "daily_limit"
  | "mic_denied"
  | "teacher_late";

/** If the teacher hasn't joined the room by then, stop waiting and offer Try again. */
const TEACHER_JOIN_TIMEOUT_MS = 25_000;

interface LessonItem {
  id: string;
  title: string;
  steps: number;
  draft: boolean;
  topic: string;
}

export function TutorRoom({
  t,
  me,
  tutorLanguage,
  screenLanguage,
  onChangeLanguage,
  onSignedOut,
  voiceId,
  speechRate,
  onChangeVoice,
}: {
  t: Strings;
  me: Me;
  tutorLanguage: LanguageCode;
  screenLanguage: LanguageCode;
  onChangeLanguage: () => void;
  onSignedOut: () => void;
  /** Learner's picked voice and speed, sent with the token request. */
  voiceId?: string;
  speechRate?: SpeechRate;
  onChangeVoice: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [avatar, setAvatar] = useState<AvatarState>("neutral");
  const roomRef = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const mouthLevel = useRef(0); // 0..1, read by the avatar every frame
  const stopMeter = useRef<() => void>(() => {});
  const [lessons, setLessons] = useState<LessonItem[] | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  // Topic the learner picked; null = the topic list. Kept across lessons in this visit.
  const [topic, setTopic] = useState<string | null>(null);
  const [lessonInfo, setLessonInfo] = useState<{ title: string; index: number; total: number; done: boolean } | null>(null);
  const [stage, setStage] = useState<StageState>(emptyStage);
  // Classroom board (video step) and where on screen the teacher should point.
  const [board, setBoard] = useState<BoardState | null>(null);
  const [pointAt, setPointAt] = useState<{ x: number; y: number } | null>(null);
  // The teacher (agent) has shown up in the room: until then, say she's getting ready.
  const [teacherHere, setTeacherHere] = useState(false);
  // The learner's mic couldn't be used: lessons still play (watch + Yes/No buttons).
  const [micOff, setMicOff] = useState(false);
  const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teacherHereRef = useRef(false);

  // Lessons available in the tutor language.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/lessons?lang=" + tutorLanguage)
      .then((r) => r.json())
      .then((d: { lessons?: LessonItem[] }) => {
        if (!cancelled) setLessons(d.lessons ?? []);
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tutorLanguage]);

  // Topics: every known topic, plus any other topic a lesson uses; with how many lessons each has.
  const topics = useMemo(() => {
    const ids = [...TOPICS.map((tp) => tp.id)];
    for (const l of lessons ?? []) if (!ids.includes(l.topic)) ids.push(l.topic);
    return ids.map((id) => ({ topic: topicInfo(id), count: (lessons ?? []).filter((l) => l.topic === id).length }));
  }, [lessons]);
  const currentTopic = topic ? topicInfo(topic) : null;
  const topicLessons = (lessons ?? []).filter((l) => l.topic === topic);

  /** Applies one lesson event from the tutor to the screen state. */
  const onLessonEvent = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case "lesson_start":
        setLessonInfo({ title: e.title, index: 0, total: e.total, done: false });
        setStage(emptyStage);
        setBoard(null);
        break;
      case "board_video":
        setBoard({ stepId: e.stepId, source: e.source, cue: null });
        break;
      case "board_cue":
        setBoard((b) => (b && b.stepId === e.stepId ? { ...b, cue: e } : b));
        break;
      case "board_done":
        setBoard((b) => (b?.stepId === e.stepId ? null : b));
        break;
      case "progress":
        setLessonInfo((i) => (i ? { ...i, index: e.index, total: e.total } : i));
        break;
      case "show_screen":
        setStage((st) => ({ ...st, screen: e.screen }));
        break;
      case "highlight":
        setStage((st) => ({ ...st, highlight: e.target }));
        break;
      case "tap":
        // The teacher presses a button: show the press, then move to the screen it leads to.
        setStage((st) => startPress(st, e.target));
        setTimeout(() => setStage((st) => afterPress(st, e.target)), 650);
        break;
      case "check":
        setStage((st) => ({ ...st, check: { stepId: e.stepId, question: e.question, options: e.options } }));
        break;
      case "check_done":
        setStage((st) => (st.check?.stepId === e.stepId ? { ...st, check: null } : st));
        break;
      case "lesson_done":
        setLessonInfo((i) => (i ? { ...i, index: i.total, done: true } : i));
        setStage((st) => ({ ...st, check: null, highlight: null, pressed: null }));
        break;
    }
  }, []);

  const send = useCallback((event: ClientEvent) => {
    void roomRef.current?.localParticipant.publishData(encodeEvent(event), { reliable: true, topic: DATA_TOPIC });
  }, []);

  const disconnect = useCallback(() => {
    if (joinTimer.current) clearTimeout(joinTimer.current);
    joinTimer.current = null;
    stopMeter.current();
    void roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  useEffect(() => disconnect, [disconnect]);

  async function connect(chosenLesson: string | null = lessonId) {
    setLessonId(chosenLesson);
    setLessonInfo(null);
    setStage(emptyStage);
    setTeacherHere(false);
    teacherHereRef.current = false;
    setMicOff(false);
    setPhase("connecting");
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tutorLanguage, screenLanguage, lessonId: chosenLesson ?? undefined, topic: topic ?? undefined, voiceId, speechRate }),
      });
      if (res.status === 402) {
        setPhase("payment_required");
        return;
      }
      if (res.status === 429) {
        setPhase("daily_limit");
        return;
      }
      if (res.status === 401) {
        onSignedOut();
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(`token ${res.status}: ${(detail as { error?: string }).error ?? "unknown error"}`);
      }
      const { url, token } = (await res.json()) as { url: string; token: string };

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;

      const teacherArrived = () => {
        teacherHereRef.current = true;
        setTeacherHere(true);
        if (joinTimer.current) clearTimeout(joinTimer.current);
        joinTimer.current = null;
      };

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        teacherArrived();
        const el = track.attach();
        audioBox.current?.appendChild(el);
        stopMeter.current();
        stopMeter.current = meterTrack(track.mediaStreamTrack, mouthLevel);
      });

      room.on(RoomEvent.DataReceived, (payload, _p, _kind, topic) => {
        if (topic !== DATA_TOPIC) return;
        const event = decodeEvent<AgentEvent>(payload);
        if (!event) return;
        teacherArrived();
        if (event.type === "avatar_state") setAvatar(event.state);
        else onLessonEvent(event);
      });

      room.on(RoomEvent.Disconnected, () => {
        stopMeter.current();
        setPhase((p) => (p === "live" ? "ended" : p));
      });

      await room.connect(url, token);
      await room.startAudio(); // we are inside a tap, so autoplay is allowed
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        // Chrome (or Windows) blocked the microphone: say so, instead of "no internet".
        const name = (err as { name?: string } | null)?.name;
        if (name === "NotAllowedError" || name === "NotFoundError" || name === "SecurityError") {
          console.warn("microphone unavailable:", name);
          if (!chosenLesson) {
            // Free conversation needs the mic.
            disconnect();
            setPhase("mic_denied");
            return;
          }
          // A lesson is watched and answered with buttons: carry on without the mic.
          setMicOff(true);
        } else {
          throw err;
        }
      }
      setPhase("live");
      // The teacher's session usually starts in 1-3 s, but can take longer when the server is busy.
      if (!teacherHereRef.current) joinTimer.current = setTimeout(() => {
        joinTimer.current = null;
        if (teacherHereRef.current) return;
        disconnect();
        setPhase("teacher_late");
      }, TEACHER_JOIN_TIMEOUT_MS);
    } catch (err) {
      console.error(err);
      disconnect();
      setPhase("error");
    }
  }

  const status =
    phase === "connecting"
      ? t.connecting
      : phase === "live" && !teacherHere
        ? t.teacherJoining
      : avatar === "listening"
        ? t.listening
        : avatar === "thinking"
          ? t.thinking
          : avatar === "speaking"
            ? t.speaking
            : "";

  const inLesson = phase === "live" && lessonInfo !== null;
  const progressPct = lessonInfo
    ? Math.round((Math.min(lessonInfo.done ? lessonInfo.total : lessonInfo.index + 1, lessonInfo.total) / Math.max(1, lessonInfo.total)) * 100)
    : 0;

  const trialLeft = me.trial ? Math.max(0, Math.floor(me.trial.minutes - me.trial.used)) : 0;

  async function signOut() {
    disconnect();
    await fetch("/api/auth/logout", { method: "POST" });
    onSignedOut();
  }

  return (
    <>
      <div className="account-bar">
        {me.paid ? (
          <span className="pill paid">✓ {t.paid}</span>
        ) : (
          <a className="pill" href="/pay">
            {fill(t.trialLeft, { n: trialLeft })} · {t.goToPay}
          </a>
        )}
        <button className="link-btn" onClick={() => void signOut()}>
          {t.signOut}
        </button>
      </div>
      {inLesson && lessonInfo && (
        <div className="lesson-head">
          <span className="lesson-title">{lessonInfo.title}</span>
          <div className="progress" aria-hidden>
            <div style={{ width: progressPct + "%" }} />
          </div>
          <span className="progress-label">
            {lessonInfo.done
              ? t.lessonFinished
              : fill(t.stepOf, { n: Math.min(lessonInfo.index + 1, lessonInfo.total), total: lessonInfo.total })}
          </span>
        </div>
      )}
      {inLesson && (board || stage.screen) ? (
        // Teaching layout: the board on top (the live, tappable phone screen, or a lesson video),
        // the teacher small at the bottom left, pointing at what she's talking about.
        <>
          {board ? (
            <Board
              board={board}
              hold={avatar === "listening" || avatar === "thinking"}
              t={t}
              onPointScreen={setPointAt}
              onMediaError={(stepId, code) => lessonId && reportVideoError(lessonId, stepId, code)}
            />
          ) : (
            <LessonStage stage={stage} screenLanguage={screenLanguage} t={t} send={send} onPointScreen={setPointAt} board />
          )}
          <div className="teach-row">
            <div className="teach-avatar">
              <Avatar state={avatar} level={mouthLevel} pointAt={pointAt} />
            </div>
            <p className="status" aria-live="polite">
              {status}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className={inLesson ? "avatar-small" : undefined}>
            <Avatar state={avatar} level={mouthLevel} />
          </div>
          <p className="status" aria-live="polite">
            {status}
          </p>
        </>
      )}
      <div ref={audioBox} hidden />

      {/* No screen yet (e.g. the intro, or a check question on its own): just the question card. */}
      {inLesson && !board && !stage.screen && <LessonStage stage={stage} screenLanguage={screenLanguage} t={t} send={send} />}

      {phase === "ready" && (
        <div className="stack">
          {currentTopic === null ? (
            <>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{t.chooseTopic}</h2>
              <div className="topic-grid">
                {topics.map(({ topic: tp, count }) => (
                  <button key={tp.id} className="btn secondary topic-card" onClick={() => setTopic(tp.id)}>
                    <span className="topic-emoji" aria-hidden>
                      {tp.emoji}
                    </span>
                    <span>{tp.name[screenLanguage]}</span>
                    <small>{fill(t.lessonCount, { n: count })}</small>
                  </button>
                ))}
              </div>
              <button className="btn secondary" onClick={() => void connect(null)}>
                💬 {t.justTalk}
              </button>
            </>
          ) : (
            <>
              <button className="btn link back-link" onClick={() => setTopic(null)}>
                ← {t.allTopics}
              </button>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
                <span aria-hidden>{currentTopic.emoji}</span> {currentTopic.name[screenLanguage]}
              </h2>
              <div className="lesson-list">
                {topicLessons.map((l) => (
                  <button key={l.id} className="btn lesson-card" onClick={() => void connect(l.id)}>
                    <span aria-hidden>▶</span>
                    <span>
                      {l.title}
                      {l.draft && <span className="draft-tag">draft</span>}
                    </span>
                  </button>
                ))}
                {lessons !== null && topicLessons.length === 0 && <p className="muted">{t.topicNoLessons}</p>}
              </div>
              <button className="btn secondary" onClick={() => void connect(null)}>
                💬 {fill(t.talkAboutTopic, { topic: currentTopic.name[screenLanguage] })}
              </button>
            </>
          )}
          <button className="btn secondary" onClick={onChangeLanguage}>
            🌐 {t.changeLanguages}
          </button>
          <button className="btn secondary" onClick={onChangeVoice}>
            🔊 {t.changeVoice}
          </button>
        </div>
      )}

      {phase === "mic_denied" && (
        <div className="controls">
          <p className="status error" style={{ gridColumn: "1 / -1" }}>
            🎤 {t.micDenied}
          </p>
          <button className="btn ask" onClick={() => void connect()}>
            {t.tryAgain}
          </button>
          <button className="btn secondary" style={{ gridColumn: "1 / -1" }} onClick={() => setPhase("ready")}>
            📚 {t.chooseLesson}
          </button>
        </div>
      )}

      {inLesson && lessonInfo?.done && (
        <button
          className="btn"
          onClick={() => {
            disconnect();
            setLessonInfo(null);
            setPhase("ready");
          }}
        >
          📚 {t.chooseAnother}
        </button>
      )}

      {phase === "live" && micOff && <p className="muted" style={{ textAlign: "center" }}>🎤 {t.noMicNotice}</p>}

      {phase === "live" && (
        <div className="controls">
          {!micOff && (
            <button className="btn ask" onClick={() => send({ type: "ask_pressed" })}>
              ✋ {t.ask}
            </button>
          )}
          <button
            className="btn secondary"
            onClick={() => send({ type: "tap_answer", value: "Please repeat that more slowly." })}
          >
            🔁 {t.repeat}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              disconnect();
              setPhase("ended");
            }}
          >
            ■ {t.end}
          </button>
        </div>
      )}

      {phase === "payment_required" && (
        <div className="controls">
          <p className="status" style={{ gridColumn: "1 / -1" }}>
            {t.trialOver}
          </p>
          <a className="btn ask" href="/pay" style={{ textAlign: "center", textDecoration: "none", lineHeight: "64px" }}>
            {t.goToPay}
          </a>
        </div>
      )}

      {phase === "daily_limit" && (
        <div className="controls">
          <p className="status" style={{ gridColumn: "1 / -1" }}>
            ⏳ {t.dailyLimit}
          </p>
        </div>
      )}

      {(phase === "ended" || phase === "error" || phase === "teacher_late") && (
        <div className="controls">
          <p className="status" style={{ gridColumn: "1 / -1" }}>
            {phase === "ended" ? t.ended : phase === "teacher_late" ? t.teacherLate : t.offline}
          </p>
          <button className="btn ask" onClick={() => void connect()}>
            {phase === "ended" ? t.startAgain : t.tryAgain}
          </button>
          <button
            className="btn secondary"
            style={{ gridColumn: "1 / -1" }}
            onClick={() => {
              setLessonInfo(null);
              setPhase("ready");
            }}
          >
            📚 {t.chooseLesson}
          </button>
        </div>
      )}
    </>
  );
}

/** Lip-sync from loudness: reads the tutor's audio level into `out` every frame. */
function meterTrack(track: MediaStreamTrack, out: { current: number }): () => void {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let frame = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    out.current = out.current * 0.6 + Math.min(1, rms * 5) * 0.4; // smooth
    frame = requestAnimationFrame(tick);
  };
  tick();
  // Safe to call more than once: "End" and the room's Disconnected event both stop the meter.
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    out.current = 0;
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  };
}
