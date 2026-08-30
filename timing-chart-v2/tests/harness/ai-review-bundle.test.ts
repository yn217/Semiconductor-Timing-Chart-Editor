import { describe, expect, it } from "vitest";

describe("AI review bundle manifest", async () => {
  const { createAiReviewBundle } = await import("../../harness/gui/ai-review-bundle.mjs");
  it("preserves scenario provenance and review inputs", () => {
    const bundle = createAiReviewBundle({ gitHead: "abc123", scenario: "RIBBON-VIEW-DESKTOP", viewport: [1672, 941], actions: ["open View"], images: { current: "dut.png" }, crops: ["workspace.png"], diagnostics: { findings: [] }, expectedChange: ["view-tab"], stableRegions: ["left-tree"] });
    expect(bundle).toMatchObject({ schemaVersion: 1, testedCommit: "abc123", scenario: "RIBBON-VIEW-DESKTOP", capture: { viewport: [1672, 941], dpr: 1 }, images: { before: null, current: "dut.png", reference: null } });
    expect(bundle.reviewInstructions.length).toBe(4);
  });
  it("rejects incomplete provenance", () => {
    expect(() => createAiReviewBundle({ gitHead: "", scenario: "fixture", viewport: [1, 1] })).toThrow();
    expect(() => createAiReviewBundle({ gitHead: "abc", scenario: "fixture", viewport: [1] })).toThrow();
  });
});
