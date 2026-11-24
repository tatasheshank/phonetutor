import { describe, expect, it } from "vitest";
import { nextScreen, SCREEN_MANIFEST, SCREEN_NAV } from "../src";

describe("screen navigation", () => {
  it("moves between screens like the real app", () => {
    expect(nextScreen("wa.chats", "row.beta")).toBe("wa.chat");
    expect(nextScreen("wa.chat", "btn.videoCall")).toBe("wa.call");
    expect(nextScreen("wa.call", "btn.endCall")).toBe("wa.chat");
    expect(nextScreen("wa.chat", "btn.back")).toBe("wa.chats");
  });

  it("stays put for taps without a destination", () => {
    expect(nextScreen("wa.chat", "btn.send")).toBeNull();
    expect(nextScreen("nope", "btn.back")).toBeNull();
  });

  it("only uses real screens and targets", () => {
    for (const [screen, links] of Object.entries(SCREEN_NAV)) {
      const targets = SCREEN_MANIFEST[screen as keyof typeof SCREEN_MANIFEST].targets as readonly string[];
      for (const [target, to] of Object.entries(links ?? {})) {
        expect(targets).toContain(target);
        expect(Object.keys(SCREEN_MANIFEST)).toContain(to);
      }
    }
  });
});

describe("target descriptions", () => {
  it("describes every target in the screen library", async () => {
    const { TARGET_DESCRIPTIONS } = await import("../src");
    for (const s of Object.values(SCREEN_MANIFEST)) {
      for (const t of s.targets) expect(TARGET_DESCRIPTIONS[t], t).toBeTruthy();
    }
  });
});
