"use client";

import { nextScreen, type ClientEvent, type LanguageCode } from "@ai-tutor/shared";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Strings } from "../lib/strings";
import { contactForTap, SCREENS, ScreenProvider, type Contact } from "./screens/PracticeScreens";

export interface StageState {
  screen: string | null;
  highlight: string | null;
  /** The button the teacher is pressing (animation), set by a "tap" event. */
  pressed: string | null;
  check: { stepId: string; question: string; options: string[] } | null;
  /** Whose chat is open (set when the teacher presses a row in the chat list). */
  contact: Contact;
}

export const emptyStage: StageState = { screen: null, highlight: null, pressed: null, check: null, contact: "son" };

/** The teacher starts pressing `target`. A press on a chat-list row opens that chat right away. */
export function startPress(st: StageState, target: string): StageState {
  return { ...st, pressed: target, contact: contactForTap(target) ?? st.contact };
}

/**
 * The stage after the teacher's press of `target` has finished: the screen it leads to, and
 * the chat it opened. Used by the tutor room and the admin preview so both behave the same.
 */
export function afterPress(st: StageState, target: string): StageState {
  if (st.pressed !== target) return st;
  return {
    ...st,
    pressed: null,
    highlight: null,
    screen: (st.screen && nextScreen(st.screen, target)) || st.screen,
  };
}

/**
 * The teacher's board during a lesson: the phone screen she operates and explains.
 * The learner only watches; the screen doesn't react to their touch. The teacher points at the
 * highlighted button and presses it herself (a "tap" event animates the press, then the screen
 * moves on). The only thing the learner answers is a check question, by voice or Yes/No.
 */
export function LessonStage({
  stage,
  screenLanguage,
  t,
  send,
  onPointScreen,
  board = false,
}: {
  stage: StageState;
  screenLanguage: LanguageCode;
  t: Strings;
  send: (e: ClientEvent) => void;
  onPointScreen?: (p: { x: number; y: number } | null) => void;
  /** Show the screen inside the classroom-board frame. */
  board?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Tell the teacher where to point: the button she is pressing, or the highlighted one.
  const pointTarget = stage.pressed ?? stage.highlight;
  useLayoutEffect(() => {
    if (!onPointScreen) return;
    const report = () => {
      const el = pointTarget
        ? rootRef.current?.querySelector<HTMLElement>(`[data-target="${CSS.escape(pointTarget)}"]`)
        : null;
      if (!el) return onPointScreen(null);
      const r = el.getBoundingClientRect();
      onPointScreen({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    report();
    window.addEventListener("resize", report);
    window.addEventListener("scroll", report, true);
    return () => {
      window.removeEventListener("resize", report);
      window.removeEventListener("scroll", report, true);
    };
  }, [pointTarget, stage.screen, onPointScreen]);

  useEffect(() => () => onPointScreen?.(null), [onPointScreen]);

  const Screen = stage.screen ? SCREENS[stage.screen] : undefined;
  const optionLabel = (o: string) => (o === "yes" ? t.yes : o === "no" ? t.no : o);
  const phone = Screen && (
    <div className="phone-frame watch-only" aria-label={t.speaking}>
      <ScreenProvider value={{ highlight: stage.highlight, pressed: stage.pressed, flash: null, onTap: null, contact: stage.contact }}>
        <Screen lang={screenLanguage} />
      </ScreenProvider>
    </div>
  );

  return (
    <div className="stage" ref={rootRef}>
      {phone && (board ? <div className="board-surface">{phone}</div> : phone)}
      {stage.check && (
        <div className="check-card">
          <p className="check-q">{stage.check.question}</p>
          <div className="row">
            {stage.check.options.map((o) => (
              <button
                key={o}
                className={`btn ${o === "no" ? "secondary" : ""}`}
                onClick={() => send({ type: "check_answer", stepId: stage.check!.stepId, value: o })}
              >
                {optionLabel(o)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
