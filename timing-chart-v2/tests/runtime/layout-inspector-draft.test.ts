import { describe, expect, it } from "vitest";
import { layoutDraftChangeCount } from "../../apps/editor/src/layout-inspector.js";

const committed = { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left" as const, rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" as const };

describe("Layout Inspector draft semantics", () => {
  it("is clean when the draft equals committed layout", () => {
    expect(layoutDraftChangeCount(committed, committed)).toBe(0);
  });

  it("counts manual, Auto Fit, and Reset draft changes without committing them", () => {
    expect(layoutDraftChangeCount({ ...committed, signalNameWidth: 240 }, committed)).toBe(1);
    expect(layoutDraftChangeCount({ roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "wrap" }, committed)).toBe(1);
    expect(layoutDraftChangeCount({ roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" }, { roleColumnWidth: 61, signalNameWidth: 148, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" })).toBe(4);
  });
});
