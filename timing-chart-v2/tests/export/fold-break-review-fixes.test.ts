import { describe, expect, it } from "vitest";
import { buildExportScene } from "@timing-chart-v2/export";
import type { CanonicalDocument, TimeGroupId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// Mirrors the live ruler (apps/editor/src/runtime/build-ruler.ts): a collapsed fold is anchored at the
// first visible display boundary after it, or the boundary before it when the fold reaches the timeline end.
function foldedDocument(timeGroups: CanonicalDocument["timeGroups"]): CanonicalDocument {
  const base = canonicalFixture();
  const { referenceClock: _referenceClock, ...timeline } = base.timeline;
  return { ...base, timeline: { ...timeline, cycleCount: 20, labelAnchors: [] }, timeGroups };
}

function collapsed(id: string, name: string, start: number, end: number) {
  return { id: id as TimeGroupId, name, start, end, presentation: { collapsed: true } };
}

describe("fold axis-break placement matches the live ruler", () => {
  it("places a mid-timeline collapsed fold break at the display boundary where the fold was removed", () => {
    const scene = buildExportScene(foldedDocument([collapsed("tg_mid", "Idle", 5, 10)]), { format: "svg", scope: "document", foldPolicy: "respect" });
    const { x: rulerX, cycleWidth } = scene.ruler;
    // Source cycle 10 is the first visible cycle after the fold; it maps to display boundary 5.
    expect(scene.axisBreaks).toEqual([{ id: "tg_mid", name: "Idle", sourceStart: 5, sourceEnd: 10, x: rulerX + 5 * cycleWidth }]);
  });

  it("emits one break for a collapsed fold nested inside another collapsed fold", () => {
    const scene = buildExportScene(foldedDocument([collapsed("tg_outer", "Outer", 5, 10), collapsed("tg_inner", "Inner", 7, 8)]), { format: "svg", scope: "document", foldPolicy: "respect" });
    const { x: rulerX, cycleWidth } = scene.ruler;
    // The inner fold's anchor (source 8) is hidden inside the merged outer fold, so the live ruler skips it.
    expect(scene.axisBreaks).toEqual([{ id: "tg_outer", name: "Outer", sourceStart: 5, sourceEnd: 10, x: rulerX + 5 * cycleWidth }]);
  });

  it("places a leading fold break at the timeline start", () => {
    const scene = buildExportScene(foldedDocument([collapsed("tg_lead", "Lead", 0, 5)]), { format: "svg", scope: "document", foldPolicy: "respect" });
    // Source 5 is the first visible cycle and maps to display 0, the left edge of the ruler.
    expect(scene.axisBreaks).toEqual([{ id: "tg_lead", name: "Lead", sourceStart: 0, sourceEnd: 5, x: scene.ruler.x }]);
  });

  it("anchors a fold that reaches the timeline end at the boundary before it, like the live ruler", () => {
    const scene = buildExportScene(foldedDocument([collapsed("tg_tail", "Tail", 15, 20)]), { format: "svg", scope: "document", foldPolicy: "respect" });
    const { x: rulerX, cycleWidth } = scene.ruler;
    // Live anchor is cycle 14 (group.start - 1), display 14.
    expect(scene.axisBreaks).toEqual([{ id: "tg_tail", name: "Tail", sourceStart: 15, sourceEnd: 20, x: rulerX + 14 * cycleWidth }]);
  });

  it("emits no break and does not crash for a collapsed fold spanning the whole timeline", () => {
    const scene = buildExportScene(foldedDocument([collapsed("tg_all", "All", 0, 20)]), { format: "svg", scope: "document", foldPolicy: "respect" });
    expect(scene.axisBreaks).toEqual([]);
    expect(Number.isFinite(scene.width)).toBe(true);
  });
});
