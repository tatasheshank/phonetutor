"use client";

import {
  getLanguage,
  LessonRunner,
  type AgentEvent,
  type LanguageCode,
  type Lesson,
  type RunnerAction,
} from "@ai-tutor/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "../../lib/strings";
import { Avatar } from "../Avatar";
import { Board, type BoardState } from "../Board";
import { reportVideoError } from "../reportVideoError";
import { afterPress, emptyStage, startPress, LessonStage, type StageState } from "../LessonStage";

/**
 * Admin preview: plays a lesson with the same LessonRunner the tutor uses, one teacher line at a
 * time (press Next), without voice. Shows exactly what learners will see on the phone.
 */
export function LessonPreview({ lesson }: { lesson: Lesson }) {
  const langs = (["te", "hi", "en"] as LanguageCode[]).filter((l) => lesson.locales[l]);
  const [lang, setLang] = useState<LanguageCode>(langs[0] ?? "en");
  const [stage, setStage] = useState<StageState>(emptyStage);
  const [caption, setCaption] = useState<string>("");
  const [done, setDone] = useState(false);
  // True while the lesson waits for the learner's answer to the check question.
  const [waiting, setWaiting] = useState(false);
  const [pointAt, setPointAt] = useState<{ x: number; y: number } | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const runnerRef = useRef<LessonRunner | null>(null);
  const queue = useRef<RunnerAction[]>([]);
  const t = strings(lang);

  const apply = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case "show_screen":
        setStage((s) => ({ ...s, screen: e.screen, pressed: null }));
        break;
      case "highlight":
        setStage((s) => ({ ...s, highlight: e.target }));
        break;
      case "tap":
        setStage((s) => startPress(s, e.target));
        setTimeout(() => setStage((s) => afterPress(s, e.target)), 650);
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
      case "check":
        setStage((s) => ({ ...s, check: { stepId: e.stepId, question: e.question, options: e.options } }));
        break;
      case "check_done":
        setStage((s) => ({ ...s, check: null }));
        break;
      case "lesson_done":
        setDone(true);
        setStage((s) => ({ ...s, highlight: null, check: null }));
        break;
    }
  }, []);

  /** Runs queued actions up to and including the next spoken line. */
  const next = useCallback(() => {
    while (queue.current.length) {
      const a = queue.current.shift()!;
      if (a.kind === "event") apply(a.event);
      else if (a.kind === "say") {
        for (const e of a.events ?? []) apply(e);
        setCaption(a.text);
        // A question is followed by a wait for the answer: show that straight away.
        if (queue.current[0]?.kind === "wait") {
          queue.current.shift();
          setWaiting(true);
        }
        return;
      } else if (a.kind === "done") setDone(true);
      else if (a.kind === "wait") {
        setWaiting(true);
        return;
      }
      // "pause" needs nothing here: the preview waits for Next anyway.
    }
  }, [apply]);

  const restart = useCallback(() => {
    const pack = lesson.locales[lang];
    if (!pack) return;
    runnerRef.current = new LessonRunner(lesson, pack, getLanguage(lang));
    queue.current = runnerRef.current.start();
    setStage(emptyStage);
    setBoard(null);
    setCaption("");
    setDone(false);
    setWaiting(false);
    next();
  }, [lesson, lang, next]);

  useEffect(() => restart(), [restart]);

  function answer(stepId: string, value: string) {
    const actions = runnerRef.current?.onCheckAnswer(stepId, value, "tap");
    if (actions) {
      setWaiting(false);
      queue.current = actions;
      next();
    }
  }

  return (
    <div className="stack" lang={lang}>
      <div className="row" style={{ gridTemplateColumns: `repeat(${langs.length}, 1fr)` }}>
        {langs.map((l) => (
          <button key={l} className={`btn ${l === lang ? "" : "secondary"}`} onClick={() => setLang(l)}>
            {getLanguage(l).name.native}
          </button>
        ))}
      </div>
      {board ? (
        <Board board={board} hold={false} t={t} onPointScreen={setPointAt} onMediaError={(stepId, code) => reportVideoError(lesson.id, stepId, code)} />
      ) : stage.screen ? (
        <LessonStage
          stage={stage}
          screenLanguage={lang}
          t={t}
          send={(e) => e.type === "check_answer" && answer(e.stepId, e.value)}
          onPointScreen={setPointAt}
          board
        />
      ) : (
        stage.check && (
          <LessonStage stage={stage} screenLanguage={lang} t={t} send={(e) => e.type === "check_answer" && answer(e.stepId, e.value)} />
        )
      )}
      <div className="teach-row">
        <div className="teach-avatar">
          <Avatar state="speaking" level={{ current: 0 }} pointAt={board || stage.screen ? pointAt : null} />
        </div>
        <p className="preview-caption">{caption || "…"}</p>
      </div>
      <div className="row">
        <button className="btn" onClick={next} disabled={done || waiting}>
          {done ? "Finished" : waiting ? "Answer the question above" : "Next ▶"}
        </button>
        <button className="btn secondary" onClick={restart}>
          ↺ Restart
        </button>
      </div>
    </div>
  );
}
