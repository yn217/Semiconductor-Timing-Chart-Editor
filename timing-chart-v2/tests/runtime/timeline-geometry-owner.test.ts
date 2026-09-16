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
    else expect(firstFailure).toMatchObject({ cycle: 2, resolvedCycle: 1, expectedBoundaryX: 20 });
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

  it("uses retained geometry boundaries instead of scanning a large source timeline", () => {
    const clockId = signalId("sig_cycle_clock");
    let findCalls = 0;
    const geometry = {
      signalId: clockId,
      find: () => { findCalls += 1; return undefined; },
      cycleBoundaryEntries: () => [
        { cycle: 0, point: "cycle-start" as const, position: { x: 0, y: 0 } },
        { cycle: 2_048, point: "cycle-start" as const, position: { x: 2_048, y: 0 } },
      ],
    };
    const document = { ...cycleDocument, timeline: { ...cycleDocument.timeline, cycleCount: 100_000, end: 100_000 } };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1);
    const sourceWindow = owner.sourceWindowForLocalRange(document, 0, 100);
    expect(sourceWindow).toEqual({ start: 0, end: 2_048 });
    expect(findCalls).toBe(0);
  });

  it("uses shared display mapping to window beyond retained geometry", () => {
    const clockId = signalId("sig_cycle_clock");
    const geometry = new ImmutableLocalGeometryMap(clockId, Array.from({ length: 2_049 }, (_, cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle, y: 0 } })));
    const document = { ...cycleDocument, timeline: { ...cycleDocument.timeline, cycleCount: 100_000, end: 100_000 } };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1);
    expect(owner.sourceWindowForLocalRange(document, 50_000, 50_100)).toEqual({ start: 49_998, end: 52_046 });
  });

  it("keeps a bounded geometry window anchored to global scroll X across re-windowing", () => {
    const clockId = signalId("sig_cycle_clock");
    const sourceStart = 4_880;
    const geometry = new ImmutableLocalGeometryMap(clockId, Array.from({ length: 2_049 }, (_, index) => ({
      cycle: sourceStart + index,
      point: "cycle-start" as const,
      position: { x: index * 40, y: 0 },
    })));
    const document = { ...cycleDocument, timeline: { ...cycleDocument.timeline, cycleCount: 100_000, end: 100_000 } };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1, 40, 0);

    // scrollLeft 39,146px is near source cycle 978 at 40px/cycle. The map's
    // retained geometry starts at cycle 4,880 but its X coordinates are local
    // to that render window; using them as global coordinates would drift the
    // next source window to roughly 5,860 instead of returning to cycle 978.
    expect(owner.sourceWindowForLocalRange(document, 39_146, 40_128)).toEqual({ start: 977, end: 3_025 });
    expect(owner.sourceBoundaryToLocalX(document, 5_000)).toBe(200_000);
    expect(owner.cycleBoundaryAtLocalX(200_000, 1, true)).toBe(5_000);
  });

  it("projects and inverts off-window cycles through the shared ruler geometry", () => {
    const clockId = signalId("sig_cycle_clock");
    const sourceStart = 4_880;
    const geometry = new ImmutableLocalGeometryMap(clockId, Array.from({ length: 2_049 }, (_, index) => ({
      cycle: sourceStart + index,
      point: "cycle-start" as const,
      position: { x: index * 40, y: 0 },
    })));
    const document = { ...cycleDocument, timeline: { ...cycleDocument.timeline, cycleCount: 100_000, end: 100_000 } };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1, 40, 0);

    const x = owner.sourceBoundaryToLocalX(document, 50_000);
    expect(x).toBe(2_000_000);
    expect(owner.sourceCycleAtLocalX(document, x!)).toBe(50_000);
  });
});
