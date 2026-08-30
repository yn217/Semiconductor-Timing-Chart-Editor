import { describe, expect, it } from "vitest";

describe("AI review bundle manifest", async () => {
  const { createAiReviewBundle, writeAiReviewBundle } = await import("../../harness/gui/ai-review-bundle.mjs");
  it("preserves scenario provenance and review inputs", () => {
    const bundle = createAiReviewBundle({ gitHead: "abc123", scenario: "RIBBON-VIEW-DESKTOP", viewport: [1672, 941], actions: ["open View"], images: { current: "dut.png" }, crops: ["workspace.png"], diagnostics: { findings: [] }, expectedChange: ["view-tab"], stableRegions: ["left-tree"], reversibility: { pass: true } });
    expect(bundle).toMatchObject({ schemaVersion: 1, testedCommit: "abc123", scenario: "RIBBON-VIEW-DESKTOP", capture: { viewport: [1672, 941], dpr: 1 }, images: { before: null, current: "dut.png", reference: null } });
    expect(bundle.reviewInstructions.length).toBe(4);
    expect(bundle.reversibility).toEqual({ pass: true });
  });
  it("rejects incomplete provenance", () => {
    expect(() => createAiReviewBundle({ gitHead: "", scenario: "fixture", viewport: [1, 1] })).toThrow();
    expect(() => createAiReviewBundle({ gitHead: "abc", scenario: "fixture", viewport: [1] })).toThrow();
  });
  it("writes a deterministic JSON manifest through an injected writer", async () => {
    let saved = "";
    const bundle = createAiReviewBundle({ gitHead: "abc", scenario: "fixture", viewport: [10, 10] });
    await expect(writeAiReviewBundle("review.json", bundle, (async (_path, contents) => { saved = contents; }) as never)).resolves.toBe("review.json");
    expect(JSON.parse(saved)).toMatchObject({ testedCommit: "abc", scenario: "fixture" });
  });
});
