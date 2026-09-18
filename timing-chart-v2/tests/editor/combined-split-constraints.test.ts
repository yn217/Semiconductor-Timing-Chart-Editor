import { describe, expect, it } from "vitest";
import { resolveCombinedSplitConstraints } from "../../apps/editor/src/workspace/combined-split-constraints.js";

describe("Combined splitter responsive constraints", () => {
  it("reserves reachable minimums and reports the actual ratio bounds at 1280x720", () => {
    const constraints = resolveCombinedSplitConstraints(225);
    expect(constraints.minPaneHeight).toBe(80);
    expect(constraints.minPercent).toBe(36);
    expect(constraints.maxPercent).toBe(60);
  });

  it("preserves the normal 15–85% range when a tall viewport can satisfy pane minimums", () => {
    const constraints = resolveCombinedSplitConstraints(600);
    expect(constraints.minPercent).toBe(15);
    expect(constraints.maxPercent).toBe(85);
  });

  it("keeps a feasible single split position when the center is shorter than two default minimums", () => {
    const constraints = resolveCombinedSplitConstraints(150);
    expect(constraints.minPaneHeight).toBe(71);
    expect(constraints.minPercent).toBe(constraints.maxPercent);
    expect(constraints.minRatio).toBe(constraints.maxRatio);
  });
});
