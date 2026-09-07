import { describe, expect, it } from "vitest";
import { buildDisplayTimeMapping, cursorDelta, displayCursorDelta, projectCursor } from "@timing-chart-v2/projection";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("semantic Cursor A/B", () => {
  it("derives source delta and projects through shared display mapping", () => {
    const state = { a: 2, b: 6 } as const; const mapping = buildDisplayTimeMapping(canonicalFixture().timeline, []);
    expect(cursorDelta(state)).toEqual({ cycles: 4 }); expect(projectCursor(state, mapping)).toEqual({ a: 2, b: 6 }); expect(displayCursorDelta(state, mapping)).toEqual({ displayCycles: 4 });
  });
  it("remains workspace-only when either cursor is clear", () => { expect(cursorDelta({ a: 2 })).toEqual({}); });
});
