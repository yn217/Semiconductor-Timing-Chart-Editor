import { describe, expect, it } from "vitest";
import { reorderTransitionBlock, transitionIdentity, type TransitionChange } from "../../apps/editor/src/runtime/transition-reorder.js";

const values: readonly TransitionChange[] = [
  { id: "a", start: 0, value: 0 },
  { id: "b", start: 2, value: 1 },
  { id: "c", start: 5, value: 0 },
  { id: "d", start: 9, value: 1 },
];

describe("reorderTransitionBlock", () => {
  it("requires normalized stable IDs instead of using mutable Start as identity", () => {
    expect(() => transitionIdentity({ start: 3, value: 1 })).toThrow("must have a stable ID");
  });

  it("rejects non-contiguous selections instead of silently changing their relative placement", () => {
    const selected = new Set([transitionIdentity(values[0]!), transitionIdentity(values[2]!)]);
    expect(reorderTransitionBlock(values, selected, 3, 12)).toBeUndefined();
  });

  it("moves a contiguous selection as one block and preserves each duration", () => {
    const selected = new Set([transitionIdentity(values[1]!), transitionIdentity(values[2]!)]);
    const result = reorderTransitionBlock(values, selected, 3, 12);
    expect(result?.values.map((change) => change.id)).toEqual(["a", "d", "b", "c"]);
    expect(result?.values.map((change) => change.start)).toEqual([0, 2, 5, 8]);
  });
});
