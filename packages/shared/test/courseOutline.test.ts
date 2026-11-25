import { describe, expect, it } from "vitest";
import { courseOutlineSchema, MAX_COURSE_LESSONS, numberParagraphs, repairOutline, toParagraphs } from "../src";

describe("toParagraphs", () => {
  it("splits on blank lines, or on lines for a step-per-line list", () => {
    expect(toParagraphs("# Excel\n\nOpen Excel.\nClick Start.\n\nType numbers.\n\nSave.")).toEqual(["# Excel", "Open Excel. Click Start.", "Type numbers.", "Save."]);
    // Fewer than 4 blocks: one step per line instead.
    expect(toParagraphs("# Excel\n\nOpen Excel.\nClick Start.")).toEqual(["# Excel", "Open Excel.", "Click Start."]);
    expect(toParagraphs("1. Open\n2. Type\n3. Sum\n4. Save\n5. Close")).toHaveLength(5);
    expect(toParagraphs("   ")).toEqual([]);
  });

  it("merges very long documents and numbers paragraphs for the prompt", () => {
    const many = Array.from({ length: 1000 }, (_, i) => `Line ${i}`).join("\n\n");
    expect(toParagraphs(many).length).toBeLessThanOrEqual(400);
    expect(numberParagraphs(["a", "b".repeat(500)], 10)).toBe(`[1] a\n[2] ${"b".repeat(10)}…`);
  });
});

const outline = (lessons: unknown[]) => courseOutlineSchema.parse({ course: "Excel", lessons });

describe("repairOutline", () => {
  it("keeps a good outline as it is", () => {
    const { lessons, warnings } = repairOutline(
      outline([
        { title: "Open Excel", from: 1, to: 4, clips: [1, 2] },
        { title: "AutoSum", from: 5, to: 9, clips: [3] },
      ]),
      9,
      3,
    );
    expect(warnings).toEqual([]);
    expect(lessons).toEqual([
      { part: 1, title: "Open Excel", from: 1, to: 4, clips: [0, 1] },
      { part: 2, title: "AutoSum", from: 5, to: 9, clips: [2] },
    ]);
  });

  it("makes ranges contiguous and covering, whatever the AI said", () => {
    const { lessons } = repairOutline(
      outline([
        { title: "B", from: 6, to: 7 },
        { title: "A", from: 3, to: 4 }, // starts late, ends early, out of order
        { title: "C", from: 6, to: 20 }, // same start as B: merged
        { title: "D", from: 50 }, // out of range: goes after the previous one
      ]),
      12,
      0,
    );
    expect(lessons.map((l) => [l.title, l.from, l.to])).toEqual([
      ["A", 1, 5],
      ["B", 6, 6],
      ["D", 7, 12],
    ]);
  });

  it("uses every clip once, in order, never going back to an earlier lesson", () => {
    const { lessons, warnings } = repairOutline(
      outline([
        { title: "One", from: 1, clips: [1, 4] }, // clip 4 claimed too early
        { title: "Two", from: 5, clips: [2, 2, 9] }, // duplicate and out-of-range
        { title: "Three", from: 9, clips: [3] }, // clip 3 goes after clip 2 in "Two": fine
      ]),
      12,
      5,
    );
    // Clip 4 (index 3) was claimed by lesson One, but clip 3 is already in lesson Three: it follows to Three.
    // Clip 5 (index 4) was never claimed: it joins its neighbour's lesson.
    expect(lessons.map((l) => l.clips)).toEqual([[0], [1], [2, 3, 4]]);
    expect(warnings.join(" ")).toContain("2 clip(s)");
  });

  it("joins the shortest lessons when there are too many", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `L${i + 1}`, from: i * 3 + 1 }));
    const { lessons, warnings } = repairOutline(outline(many), 60, 0);
    expect(lessons).toHaveLength(MAX_COURSE_LESSONS);
    expect(lessons[0]!.from).toBe(1);
    expect(lessons.at(-1)!.to).toBe(60);
    for (let k = 1; k < lessons.length; k++) expect(lessons[k]!.from).toBe(lessons[k - 1]!.to + 1);
    expect(warnings.join(" ")).toContain("joined into");
  });

  it("survives an empty or garbage outline", () => {
    const { lessons } = repairOutline(courseOutlineSchema.parse({ lessons: [{ from: "x", clips: "nope" }] }), 5, 2);
    expect(lessons).toEqual([{ part: 1, title: "Part 1", from: 1, to: 5, clips: [0, 1] }]);
    expect(repairOutline(courseOutlineSchema.parse({}), 3, 0).lessons).toHaveLength(1);
  });
});
