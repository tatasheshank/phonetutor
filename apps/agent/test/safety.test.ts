import { describe, expect, it } from "vitest";
import { getLanguage } from "@ai-tutor/shared";
import { buildInstructions } from "../src/prompt";
import { isScamEmergency, redact } from "../src/safety";
import { parseSettings } from "../src/settings";

describe("isScamEmergency", () => {
  it.each([
    "I told him my OTP",
    "nenu OTP cheppanu",
    "naa account nunchi money cut ayyindi",
    "నా డబ్బులు పోయాయి",
    "ఎవరో ఫోన్ చేసి OTP అడిగితే చెప్పాను",
    "मेरे पैसे कट गए",
    "मैंने OTP बता दिया",
    "I think it is a scam",
  ])("flags %s", (text) => {
    expect(isScamEmergency(text)).toBe(true);
  });

  it.each([
    "how do I make a video call",
    "వీడియో కాల్ ఎలా చేయాలి",
    "WhatsApp lo photo ela pampali",
    "वीडियो कॉल कैसे करते हैं",
  ])("does not flag %s", (text) => {
    expect(isScamEmergency(text)).toBe(false);
  });
});

describe("redact", () => {
  it("hides OTPs, PINs and card numbers", () => {
    expect(redact("my otp is 482913")).toBe("my otp is [redacted]");
    expect(redact("pin 1234")).toBe("pin [redacted]");
    expect(redact("card 4111 1111 1111 1111")).toBe("card [redacted]");
  });

  it("keeps 1-3 digit numbers, redacts 4+ (including 1930)", () => {
    expect(redact("step 2 of 5")).toBe("step 2 of 5");
    expect(redact("call 1930")).toBe("call [redacted]");
  });
});

describe("parseSettings", () => {
  it("defaults to Telugu when metadata is missing or bad", () => {
    expect(parseSettings(undefined).settings.tutorLanguage).toBe("te");
    expect(parseSettings("not json").settings.tutorLanguage).toBe("te");
    expect(parseSettings('{"tutorLanguage":"xx"}').settings.tutorLanguage).toBe("te");
  });

  it("reads valid settings", () => {
    const { settings, language } = parseSettings(
      JSON.stringify({ tutorLanguage: "hi", screenLanguage: "en", endpointingMs: 1200 }),
    );
    expect(settings).toMatchObject({ tutorLanguage: "hi", screenLanguage: "en", endpointingMs: 1200, voiceId: "ritu-friendly", speechRate: "normal" });
    expect(language.bcp47).toBe("hi-IN");
  });

  it("clamps endpointing to the language default when out of range", () => {
    const { settings } = parseSettings(JSON.stringify({ tutorLanguage: "te", endpointingMs: 50 }));
    expect(settings.endpointingMs).toBe(900);
  });
});

describe("buildInstructions", () => {
  it("names the reply language and word limit", () => {
    const p = buildInstructions(getLanguage("te"));
    expect(p).toContain("reply in Telugu only");
    expect(p).toContain("at most 40 words");
    expect(p).toContain("1930");
  });
});

describe("parseSettings voice", () => {
  it("uses the learner's chosen voice and speed", () => {
    const { settings, voice } = parseSettings(
      JSON.stringify({ tutorLanguage: "te", voiceId: "anand-classic", speechRate: "slow" }),
    );
    expect(voice.speaker).toBe("anand");
    expect(voice.model).toBe("bulbul:v3");
    expect(settings.speechRate).toBe("slow");
  });

  it("falls back to the language default voice and normal speed", () => {
    const { settings, voice } = parseSettings(JSON.stringify({ tutorLanguage: "hi", voiceId: "evil", speechRate: "x" }));
    expect(voice.id).toBe("ritu-friendly");
    expect(settings.speechRate).toBe("normal");
  });
});
