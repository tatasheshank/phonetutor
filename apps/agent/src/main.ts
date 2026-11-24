import {
  DATA_TOPIC,
  LessonRunner,
  decodeEvent,
  encodeEvent,
  type AgentEvent,
  type AvatarState,
  type ClientEvent,
  type LanguageConfig,
} from "@ai-tutor/shared";
import {
  type JobContext,
  type JobProcess,
  type llm,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import { RoomEvent } from "@livekit/rtc-node";
import dotenv from "dotenv";
import { constants as osConstants, setPriority } from "node:os";
import { fileURLToPath } from "node:url";
import { LessonDriver } from "./lesson/driver";
import { loadLesson } from "./lesson/load";
import { buildInstructions } from "./prompt";
import { buildLlm, buildStt, buildTts, llmChoice, sttStreaming } from "./providers";
import { isScamEmergency, redact } from "./safety";
import { parseSettings } from "./settings";
import { checkCapAlerts, notifySessionCost } from "./costAlerts";
import { dailyCapReached, UsageTracker, writeUsage } from "./usage";

dotenv.config();

// Live speech must not fall behind when the computer is busy with other work: speech detection
// runs on the CPU, and at normal priority it can lag by many seconds on a loaded laptop.
// Runs in every process (the worker and each session process). Turn off with AGENT_HIGH_PRIORITY=false.
if (process.env.AGENT_HIGH_PRIORITY !== "false") {
  try {
    setPriority(osConstants.priority.PRIORITY_ABOVE_NORMAL);
  } catch (err) {
    console.warn("[tutor] could not raise process priority", err);
  }
}

/** Hard cap on one room, from the plan's guardrails. */
const MAX_SESSION_MS = 30 * 60 * 1000;

/** A scripted lesson in progress: the runner decides what happens, the driver plays it. */
interface ActiveLesson {
  runner: LessonRunner;
  driver: LessonDriver;
}

class Tutor extends voice.Agent {
  readonly lang: LanguageConfig;
  readonly lesson: ActiveLesson | null;

  constructor(lang: LanguageConfig, lesson: ActiveLesson | null) {
    super({ instructions: buildInstructions(lang) });
    this.lang = lang;
    this.lesson = lesson;
  }

  override async onEnter(): Promise<void> {
    if (this.lesson) void this.lesson.driver.run(this.lesson.runner.start());
    else this.session.say(this.lang.phrases.greeting);
  }

  override async onUserTurnCompleted(turnCtx: llm.ChatContext, msg: llm.ChatMessage): Promise<void> {
    const text = msg.textContent ?? "";
    // Scam emergencies get the authored script, never an LLM answer.
    if (isScamEmergency(text)) {
      this.lesson?.driver.onLearnerTurn();
      this.session.say(this.lang.phrases.scamHelp, { allowInterruptions: false });
      throw new voice.StopResponse();
    }
    if (!this.lesson) return;

    // A spoken answer to the current check step ("yes, I understood") moves the lesson on.
    const answer = this.lesson.runner.onCheckAnswer(null, text, "voice");
    if (answer) {
      void this.lesson.driver.run(answer);
      throw new voice.StopResponse();
    }

    // Anything else is a question: answer it live, grounded in the current step.
    this.lesson.driver.onLearnerTurn();
    turnCtx.addMessage({ role: "system", content: this.lesson.runner.contextForLlm() });
  }
}

function avatarFor(state: voice.AgentState): AvatarState {
  switch (state) {
    case "speaking":
      return "speaking";
    case "thinking":
      return "thinking";
    case "listening":
      return "listening";
    default:
      return "neutral";
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    const { settings, language, voice: tutorVoice } = parseSettings(participant.metadata);
    console.log(
      `[tutor] room=${ctx.room.name} tutor=${settings.tutorLanguage} screen=${settings.screenLanguage} endpointing=${settings.endpointingMs}ms voice=${tutorVoice.id} (${tutorVoice.speaker}, ${tutorVoice.model}) rate=${settings.speechRate}`,
    );

    const vad = ctx.proc.userData.vad as silero.VAD;
    vad.updateOptions({ activationThreshold: language.vadThreshold });

    const session = new voice.AgentSession({
      vad,
      stt: buildStt(language),
      tts: buildTts(language, tutorVoice, settings.speechRate),
      llm: buildLlm(),
      turnHandling: {
        // Our own silence-based end of turn (VAD + endpointingMs). Without this, LiveKit
        // auto-loads its end-of-turn model, which is billed per request for self-hosted
        // agents after a dev allowance and isn't tuned for Telugu.
        turnDetection: "vad",
        endpointing: { minDelay: settings.endpointingMs, maxDelay: 4000 },
        // Ignore short noises (TV, a cough) as interruptions.
        interruption: { minDuration: 600 },
      },
    });

    const send = (event: AgentEvent) => {
      ctx.room.localParticipant
        ?.publishData(encodeEvent(event), { reliable: true, topic: DATA_TOPIC })
        .catch((err: unknown) => console.warn("[tutor] publishData failed", err));
    };

    // Scripted lesson, if the learner picked one. On any problem, fall back to free conversation.
    let lesson: ActiveLesson | null = null;
    if (settings.lessonId) {
      const loaded = await loadLesson(settings.lessonId, settings.tutorLanguage);
      if (loaded.ok) {
        lesson = {
          runner: new LessonRunner(loaded.lesson, loaded.pack, language),
          driver: new LessonDriver({
            say: (text) => session.say(text),
            send,
            shallWeContinue: language.phrases.shallWeContinue,
            log: (m, err) => console.warn(m, err),
          }),
        };
        console.log(`[lesson] ${settings.lessonId} (${settings.tutorLanguage}): ${lesson.runner.total} steps`);
      } else {
        console.warn(`[lesson] ${loaded.error}; using free conversation`);
      }
    }

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      send({ type: "avatar_state", state: avatarFor(ev.newState) });
      if (ev.oldState === "speaking" && ev.newState === "listening") lesson?.driver.onAgentIdle();
    });

    // Cost tracking: every billable event is counted and priced for the cost dashboard.
    const llm = llmChoice();
    const tracker = new UsageTracker({
      id: ctx.room.name ?? `session-${Date.now()}`,
      learnerId: settings.learnerId,
      tutorLanguage: settings.tutorLanguage,
      screenLanguage: settings.screenLanguage,
      llmProvider: llm.provider,
      llmModel: llm.model,
      ttsModel: tutorVoice.model,
      sttStreaming: sttStreaming(),
    });
    // Snapshot every minute so a crash loses at most a minute of usage, then enforce the daily cap:
    // if today's AI spend has reached DAILY_SPEND_CAP_INR, say goodbye and end the session.
    let capHit = false;
    const snapshot = setInterval(() => {
      void (async () => {
        await writeUsage(tracker.record("live"));
        await checkCapAlerts(); // 80% / cap-reached phone alerts, once a day each
        if (capHit) return;
        const cap = await dailyCapReached();
        if (!cap.reached) return;
        capHit = true;
        console.log(`[cost] daily cap reached: ₹${cap.spent.toFixed(2)} of ₹${cap.cap}. Ending session.`);
        try {
          await Promise.resolve(session.interrupt()).catch(() => {});
          await session.say(language.phrases.demoLimit, { allowInterruptions: false }).waitForPlayout();
        } catch {
          // ending anyway
        }
        void session.close();
      })();
    }, 60_000);
    void writeUsage(tracker.record("live"));

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (!ev.isFinal) return;
      tracker.addLearnerTurn();
      console.log(`[tutor] learner (${settings.tutorLanguage}): ${redact(ev.transcript)}`);
    });

    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      tracker.add(ev.metrics);
      // Latency per stage, per language: the M0 measurement the plan asks for.
      console.log(`[metrics] lang=${settings.tutorLanguage} ${JSON.stringify(ev.metrics)}`);
    });

    session.on(voice.AgentSessionEventTypes.Close, () => {
      clearInterval(snapshot);
      const final = tracker.record("ended");
      console.log(`[cost] session ${final.id}: ₹${final.cost.total.toFixed(2)} (${(final.usage.roomMs / 60000).toFixed(1)} min)`);
      // Write first so today's total in the notification includes this session.
      void writeUsage(final).then(async () => {
        await notifySessionCost(final);
        await checkCapAlerts();
      });
    });

    ctx.room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== DATA_TOPIC) return;
      const event = decodeEvent<ClientEvent>(payload);
      if (!event) return;
      switch (event.type) {
        case "ask_pressed":
          // The big Ask button: stop talking and listen.
          Promise.resolve(session.interrupt()).catch(() => {});
          send({ type: "avatar_state", state: "listening" });
          break;
        case "tap_answer":
          // The Repeat button. In a lesson, repeat the current step; otherwise ask the LLM.
          if (lesson) void lesson.driver.run(lesson.runner.resume());
          else session.generateReply({ userInput: event.value });
          break;
        case "check_answer": {
          const actions = lesson?.runner.onCheckAnswer(event.stepId, event.value, "tap");
          if (lesson && actions) void lesson.driver.run(actions);
          break;
        }
      }
    });

    await session.start({ agent: new Tutor(language, lesson), room: ctx.room });

    const limit = setTimeout(() => {
      session.say(language.phrases.shallWeContinue);
      void session.close();
    }, MAX_SESSION_MS);
    session.on(voice.AgentSessionEventTypes.Close, () => {
      clearTimeout(limit);
      lesson?.driver.dispose();
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    // Each lesson runs in its own process. Starting one (TypeScript via tsx + loading the
    // Silero VAD model) can take over the 10 s default on a laptop, which fails the job with
    // "runner initialization timed out" and no tutor joins. Allow 60 s, and keep one process
    // warmed up so a new lesson normally starts without waiting at all.
    initializeProcessTimeout: 60_000,
    numIdleProcesses: 1,
  }),
);
