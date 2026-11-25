import { describe, expect, it } from "vitest";
import { normalizeTopicId, TOPICS, topicInfo } from "../src";

describe("topics", () => {
  it("knows the built-in topics in every app language", () => {
    for (const t of TOPICS) for (const lang of ["en", "te", "hi"] as const) expect(t.name[lang]).toBeTruthy();
  });
  it("maps old 'generated' lessons to phone basics", () => {
    expect(normalizeTopicId("generated")).toBe("phone-basics");
    expect(topicInfo("generated").id).toBe("phone-basics");
  });
  it("names unknown topics from their slug", () => {
    const t = topicInfo("excel-basics");
    expect(t.name.en).toBe("Excel basics");
    expect(t.about).toBe("excel basics");
  });
});
