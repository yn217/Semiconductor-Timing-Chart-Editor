import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import { DisplayTimeMappingCache, type RenderProjection } from "@timing-chart-v2/projection";
import { cycleDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";
import { signalId } from "../../apps/editor/src/minimal-cycle-view-fixture-helpers.js";
import { TimelineGeometryOwner, usesFullDocumentWaveformWindow } from "../../apps/editor/src/runtime/timeline-geometry-owner.js";

describe("TimelineGeometryOwner", () => {
  it("keeps the full-document waveform window through 4096 cycles and windows larger documents", () => {
    expect(usesFullDocumentWaveformWindow(4_096)).toBe(true);
    expect(usesFullDocumentWaveformWindow(4_097)).toBe(false);
    expect(usesFullDocumentWaveformWindow(500, 16)).toBe(true);
    expect(usesFullDocumentWaveformWindow(500, 100)).toBe(false);
  });

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

  it.each([160, 3_000, 4_096])("keeps the full WaveDrom source range stable while scrolling a %i-cycle document", (cycleCount) => {
    const clockId = signalId("sig_cycle_clock");
    const geometry = new ImmutableLocalGeometryMap(clockId, Array.from({ length: 31 }, (_, cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle * 40, y: 0 } })));
    const document = { ...cycleDocument, timeline: { ...cycleDocument.timeline, cycleCount, end: cycleCount } };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1);

    expect(owner.sourceWindowForLocalRange(document, 0, 28)).toEqual({ start: 0, end: cycleCount });
    expect(owner.sourceWindowForLocalRange(document, cycleCount - 30, cycleCount)).toEqual({ start: 0, end: cycleCount });
    owner.requestSourceCycle(Math.floor(cycleCount * 0.8));
    expect(owner.sourceWindowForLocalRange(document, cycleCount * 0.8, cycleCount)).toEqual({ start: 0, end: cycleCount });
  });

  it("bounds a high-signal-count mid-size document using shared viewport geometry", () => {
    const clockId = signalId("sig_cycle_clock");
    const geometry = new ImmutableLocalGeometryMap(clockId, Array.from({ length: 31 }, (_, cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle * 40, y: 0 } })));
    const signals = Array.from({ length: 100 }, (_, index) => ({
      ...cycleDocument.signals[0]!,
      id: signalId(index === 0 ? "sig_cycle_clock" : `sig_perf_${index}`),
    }));
    const document = {
      ...cycleDocument,
      timeline: { ...cycleDocument.timeline, cycleCount: 500, end: 500 },
      signals,
    };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1);

    expect(owner.sourceWindowForLocalRange(document, 0, 1_120)).toEqual({ start: 0, end: 128 });
    owner.requestSourceCycle(400);
    expect(owner.sourceWindowForLocalRange(document, 0, 1_120)).toEqual({ start: 319, end: 482 });
  });

  it("bootstraps with the same quantized tile span used after geometry becomes available", () => {
    const document = {
      ...cycleDocument,
      timeline: { ...cycleDocument.timeline, cycleCount: 500, end: 500 },
      signals: Array.from({ length: 100 }, (_, index) => ({
        ...cycleDocument.signals[0]!,
        id: signalId(index === 0 ? "sig_cycle_clock" : `sig_perf_${index}`),
      })),
    };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map(),
      getDocument: () => document,
      getProjection: () => ({} as RenderProjection),
      onSnapIndexBuilt: () => undefined,
    });

    // The settled first viewport window is 0..128 for this signal density;
    // bootstrapping 0..163 caused each owner to render once, then replace it.
    expect(owner.sourceWindowForLocalRange(document, 0, 1_120)).toEqual({ start: 0, end: 128 });
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
    expect(owner.sourceWindowForLocalRange(document, 50_000, 50_100)).toEqual({ start: 49_920, end: 50_432 });
    // Small scroll steps must not change the window (grid-quantized, #621).
    const base = owner.sourceWindowForLocalRange(document, 50_000, 50_100);
    for (const shift of [1, 5, 20, 40]) expect(owner.sourceWindowForLocalRange(document, 50_000 + shift, 50_100 + shift)).toEqual(base);
  });

  it("projects off-window source boundaries from the shared ruler geometry", () => {
    const clockId = signalId("sig_cycle_clock");
    const geometry = new ImmutableLocalGeometryMap(clockId, Array.from({ length: 31 }, (_, cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle * 5, y: 0 } })));
    const document = {
      ...cycleDocument,
      timeline: { ...cycleDocument.timeline, cycleCount: 100, end: 100 },
      timeGroups: [{ id: "off-window-fold" as never, name: "Fold", start: 40, end: 60, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "GAP" } }],
    };
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, geometry]]),
      getDocument: () => document,
      getProjection: () => ({ rowLayout: [{ rowId: clockId, kind: "timing", visible: true, y: 0 }] } as never),
      onSnapIndexBuilt: () => undefined,
    });
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry }, 1, 5, 13);

    const displayCycle = owner.displayMapping.sourceToDisplay[70];
    expect(displayCycle).toBeDefined();
    expect(geometry.find({ signalId: clockId, cycle: 70, point: "cycle-start" })).toBeUndefined();
    expect(owner.sourceBoundaryToLocalX(document, 70)).toBe(13 + displayCycle! * 5);
    // Folded source cycles use displayBoundaryForSource's established shared
    // mapping semantics rather than a Transaction-local projection.
    expect(owner.sourceBoundaryToLocalX(document, 50)).toBe(13 + owner.displayMapping.sourceToDisplay[60]! * 5);
  });
});
