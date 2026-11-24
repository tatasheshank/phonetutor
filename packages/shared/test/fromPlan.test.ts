import { describe, expect, it } from "vitest";
import { lessonFromPlan, lessonPlanSchema, mergeTranslatedPack, slugify, validateLesson } from "../src";

const plan = lessonPlanSchema.parse({
  title: "Make a video call on WhatsApp",
  objectives: ["start a video call", "end the call"],
  steps: [
    { kind: "explain", text: "Today we learn video calls." },
    { kind: "show", screen: "wa.chats", target: "row.beta", text: "This is your chat list. Here is Ravi." },
    { kind: "press", screen: "wa.chat", target: "btn.videoCall", text: "I press the camera button." },
    { kind: "press", screen: "wa.call", target: "btn.endCall", text: "I press the red button to end." },
    { kind: "check", question: "Did you understand video calls?", accept: ["yes I did"] },
  ],
});

describe("lessonFromPlan", () => {
  it("builds a valid lesson that plays as a teacher demonstration", () => {
    const { lesson, warnings } = lessonFromPlan(plan, "wa-video-call-gen");
    expect(warnings).toEqual([]);
    expect(lesson.steps.map((s) => s.type)).toEqual(["say", "show", "practice", "practice", "check"]);
    expect(lesson.screens).toEqual(["wa.chats", "wa.chat", "wa.call"]);
    expect(lesson.locales.en!.steps.s5!.question).toBe("Did you understand video calls?");
    expect(lesson.locales.en!.steps.s5!.accept).toContain("yes i did");
    // Structurally valid (only "not reviewed yet" remains).
    const r = validateLesson(lesson);
    expect(r.errors).toEqual(["locales: a scripted lesson needs at least one reviewed locale pack"]);
  });

  it("turns unknown screens and buttons into spoken steps, with warnings", () => {
    const p = lessonPlanSchema.parse({
      title: "Pay with UPI",
      steps: [
        { kind: "show", screen: "upi.home", target: "btn.pay", text: "Open your UPI app." },
        { kind: "press", screen: "wa.chat", target: "btn.payNow", text: "Press pay." },
      ],
    });
    const { lesson, warnings } = lessonFromPlan(p, "upi");
    expect(lesson.steps.map((s) => s.type)).toEqual(["say", "show", "check"]);
    expect(warnings.join("\n")).toContain('no built-in screen "upi.home"');
    expect(warnings.join("\n")).toContain('has no button "btn.payNow"');
    expect(validateLesson(lesson).errors.filter((e) => !e.startsWith("locales:"))).toEqual([]);
  });

  it("adds a check question when the plan has none, and says when nothing matches a screen", () => {
    const p = lessonPlanSchema.parse({ title: "Charging", steps: [{ kind: "explain", text: "Plug in the charger." }] });
    const { lesson, warnings } = lessonFromPlan(p, "charging");
    expect(lesson.steps.at(-1)!.type).toBe("check");
    expect(lesson.locales.en!.steps[lesson.steps.at(-1)!.id]!.question).toBe("Did you understand?");
    expect(warnings.join("\n")).toContain("explains it in words only");
  });

  it("drops empty steps, tolerates odd kinds, and caps long plans", () => {
    const p = lessonPlanSchema.parse({
      title: "Long",
      steps: [{ kind: "dance", text: "Odd kind becomes explain." }, { kind: "explain", text: "  " }, ...Array.from({ length: 30 }, (_, i) => ({ kind: "explain", text: `Line ${i}` }))],
    });
    const { lesson, warnings } = lessonFromPlan(p, "long");
    expect(lesson.steps.length).toBe(14);
    expect(lesson.locales.en!.steps.s1!.text).toBe("Odd kind becomes explain.");
    expect(warnings.join("\n")).toContain("only the first 13 were kept");
    expect(Object.keys(lesson.locales.en!.steps)).toHaveLength(14);
  });
});

describe("mergeTranslatedPack", () => {
  const { lesson } = lessonFromPlan(plan, "x");
  const en = lesson.locales.en!;

  it("keeps step ids, falls back to English for missing lines, and keeps English answers", () => {
    const { pack, warnings } = mergeTranslatedPack(
      en,
      { title: "వీడియో కాల్", steps: { s1: { text: "ఈ రోజు వీడియో కాల్ నేర్చుకుందాం." }, s5: { question: "అర్థమైందా?", accept: ["అవును"] } } },
      "te",
    );
    expect(Object.keys(pack.steps)).toEqual(Object.keys(en.steps));
    expect(pack.title).toBe("వీడియో కాల్");
    expect(pack.steps.s1!.text).toBe("ఈ రోజు వీడియో కాల్ నేర్చుకుందాం.");
    expect(pack.steps.s2!.text).toBe(en.steps.s2!.text); // fallback
    expect(pack.steps.s5!.accept).toEqual(expect.arrayContaining(["అవును", "yes"]));
    expect(warnings[0]).toContain("te: 3 line(s) were not translated");
  });

  it("survives garbage from the model", () => {
    expect(mergeTranslatedPack(en, "not json", "hi").pack.title).toBe(en.title);
  });
});

describe("slugify", () => {
  it("makes URL-safe ids", () => {
    expect(slugify("Send a Photo on WhatsApp!")).toBe("send-a-photo-on-whatsapp");
    expect(slugify("వీడియో")).toBe("lesson");
  });
});

describe("lessonFromPlan: show-then-press", () => {
  it("merges 'show X' followed by 'press X' into one press, keeping the show's line", () => {
    const p = lessonPlanSchema.parse({
      title: "Voice call",
      steps: [
        { kind: "show", screen: "wa.chat", target: "btn.voiceCall", text: "At the top right is the phone icon. I press it." },
        { kind: "press", screen: "wa.chat", target: "btn.voiceCall", text: "I press the phone icon." },
        { kind: "press", screen: "wa.call", target: "btn.endCall", text: "I press red to end." },
      ],
    });
    const { lesson } = lessonFromPlan(p, "vc");
    expect(lesson.steps.map((s) => s.type)).toEqual(["practice", "practice", "check"]);
    expect(lesson.steps.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(lesson.locales.en!.steps.s1!.text).toBe("At the top right is the phone icon. I press it.");
  });
});
