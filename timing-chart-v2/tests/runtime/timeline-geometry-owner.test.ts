import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import { DisplayTimeMappingCache, type RenderProjection } from "@timing-chart-v2/projection";
import { cycleDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";
import { signalId } from "../../apps/editor/src/minimal-cycle-view-fixture-helpers.js";
import { TimelineGeometryOwner } from "../../apps/editor/src/runtime/timeline-geometry-owner.js";

describe("TimelineGeometryOwner", () => {
  it.each([
    ["normal Cycle", cycleDocument],
    ["Combined Cycle pane with collapsed fold", {
      ...cycleDocument,
      timeline: { ...cycleDocument.timeline, cycleCount: 20, end: 20 },
      timeGroups: [{ id: "diagnostic-fold" as never, name: "Fold", start: 2, end: 4, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "GAP" } }],
    }],
  ])("round-trips every semantic cycle boundary for %s", (name, document) => {
    const clockId = signalId("sig_cycle_clock");
    const geometry = new ImmutableLocalGeometryMap(clockId, Array.from({ length: 21 }, (_, cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle * 10, y: 0 } })));
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1);
    const entries = owner.currentSnapIndex().entries().filter((candidate) => candidate.kind === "cycle-boundary").sort((a, b) => a.point.x - b.point.x);
    const mapping = owner.displayMapping;
    const rows = Array.from({ length: 21 }, (_, cycle) => {
      const expected = owner.sourceBoundaryToLocalX(document, cycle);
      const stored = entries.find((entry) => entry.anchor.cycle === cycle)?.point.x;
      const resolved = expected === undefined ? undefined : owner.cycleBoundaryAtLocalX(expected, 1, true);
      const index = entries.findIndex((entry) => entry.anchor.cycle === cycle);
      return { cycle, expectedBoundaryX: expected, storedBoundaryX: stored, displayMappedX: mapping.sourceToDisplay[cycle], resolvedCycle: resolved, previousBoundaryX: entries[index - 1]?.point.x, nextBoundaryX: entries[index + 1]?.point.x };
    });
    console.table({ configuration: name, rows });
    const firstFailure = rows.find((row) => row.resolvedCycle !== row.cycle);
    if (name === "normal Cycle") expect(firstFailure).toBeUndefined();
    else expect(firstFailure).toMatchObject({ cycle: 2, resolvedCycle: 4, expectedBoundaryX: 20 });
  });

  it("owns source-boundary, presentation-scale, and screen-to-local conversion", () => {
    const clockId = signalId("sig_cycle_clock");
    const clockGeometry = new ImmutableLocalGeometryMap(clockId, [
      { cycle: 0, point: "cycle-start", position: { x: 8, y: 0 } },
      { cycle: 1, point: "cycle-start", position: { x: 28, y: 0 } },
    ]);
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, clockGeometry]]),
      getDocument: () => cycleDocument,
      getProjection: () => ({} as RenderProjection),
      onSnapIndexBuilt: () => undefined,
    });

    expect(owner.sourceBoundaryToLocalX(cycleDocument, 0)).toBe(8);
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry: clockGeometry }, 2);
    expect(owner.sourceBoundaryToLocalX(cycleDocument, 1)).toBe(56);
    expect(owner.screenToLocal({ x: 40, y: 12 }, 2)).toEqual({ x: 20, y: 6 });
  });
});
