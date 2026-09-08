import { describe, expect, it } from "vitest";
import { buildDisplayTimeMapping, cursorDelta, displayCursorDelta, projectCursor } from "@timing-chart-v2/projection";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("semantic Cursor A/B", () => {
  it("derives source delta and projects through shared display mapping", () => {
    const state = { a: 2, b: 6 } as const; const mapping = buildDisplayTimeMapping(canonicalFixture().timeline, []);
    expect(cursorDelta(state)).toEqual({ cycles: 4 }); expect(projectCursor(state, mapping)).toEqual({ a: 2, b: 6 }); expect(displayCursorDelta(state, mapping)).toEqual({ displayCycles: 4 });
    expect(cursorDelta(state, 2.5)).toEqual({ cycles: 4, physicalTime: 10 });
  });
  it("remains workspace-only when either cursor is clear", () => { expect(cursorDelta({ a: 2 })).toEqual({}); });
  it("projects source cursors through folded display time without changing source delta", () => {
    const mapping = buildDisplayTimeMapping({ cycleCount: 10, labelAnchors: [] }, [{ id: "tg_fold", name: "Fold", start: 2, end: 5, presentation: { collapsed: true } }]);
    expect(cursorDelta({ a: 1, b: 6 })).toEqual({ cycles: 5 });
    expect(projectCursor({ a: 1, b: 6 }, mapping)).toEqual({ a: 1, b: 3 });
    expect(displayCursorDelta({ a: 1, b: 6 }, mapping)).toEqual({ displayCycles: 2 });
  });
});
