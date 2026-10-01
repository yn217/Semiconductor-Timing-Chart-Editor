import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping, type DisplayTimeViewport, type RenderProjection } from "@timing-chart-v2/projection";
import type { SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { projectAnnotationOverlays } from "../../apps/editor/src/runtime/annotation-overlays.js";
import { resolveAnchorPoint } from "../../apps/editor/src/resolve-anchor-point.js";

function projectionFor(signalId: SignalId, visible: boolean): RenderProjection {
  return {
    rowLayout: [{ rowId: signalId, groupId: "grp_main", groupName: "Main", kind: "timing", name: "DATA", visible, y: 120, height: 28 }],
    totalHeight: 148,
  } as unknown as RenderProjection;
}

describe("annotation visibility and semantic targets", () => {
  it("caches clockless axis-owner metadata by Signal collection and avoids per-Annotation Signal scans", () => {
    const source = canonicalFixture();
    const signal = source.signals.find((item) => item.type !== "commentRow")!;
    let indexedSignalReads = 0;
    const signals = new Proxy(source.signals, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedSignalReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const annotations = Array.from({ length: 40 }, (_, cycle) => ({
      id: `ann_cycle_only_${cycle}` as never,
      type: "text" as const,
      label: `Cycle ${cycle}`,
      visible: true,
      anchor: { cycle, point: "cycle-start" as const },
    }));
    const document = {
      ...source,
      signals,
      timeline: { ...source.timeline, referenceClock: undefined },
      annotations,
    };
    const map = new ImmutableLocalGeometryMap(signal.id, annotations.map((_, cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle * 10, y: 0 } })));
    const maps = new Map([[signal.id, map]]);
    const projection = projectionFor(signal.id, true);
    const mapping = buildDisplayTimeMapping(document.timeline, []);

    expect(projectAnnotationOverlays(document, projection, maps, mapping)).toHaveLength(40);
    const readsAfterFirstProjection = indexedSignalReads;
    expect(projectAnnotationOverlays(document, projection, maps, mapping)).toHaveLength(40);

    expect(readsAfterFirstProjection).toBe(source.signals.length);
    expect(indexedSignalReads).toBe(readsAfterFirstProjection);
  });

  it("does not resolve an anchor onto a hidden Signal's retained navigation row", () => {
    const document = canonicalFixture();
    const signal = document.signals[1]!;
    const map = new ImmutableLocalGeometryMap(signal.id, [{ cycle: 1, point: "value-start", position: { x: 24, y: 0 } }]);
    const anchor = { signalId: signal.id, cycle: 1, point: "value-start" as const };
    const mapping = buildDisplayTimeMapping(document.timeline, []);

    expect(resolveAnchorPoint(anchor, document, projectionFor(signal.id, false), new Map([[signal.id, map]]), mapping)).toBeUndefined();
    expect(resolveAnchorPoint(anchor, document, projectionFor(signal.id, true), new Map([[signal.id, map]]), mapping)).toEqual({ x: 24, y: 120 });
  });

  it("omits an annotation whose semantic target is hidden", () => {
    const source = canonicalFixture();
    const signal = source.signals[1]!;
    const document = {
      ...source,
      signals: source.signals.map((item) => item.id === signal.id ? { ...item, display: { ...item.display, visible: false } } : item),
      annotations: [{ id: "ann_hidden" as never, type: "text" as const, label: "Hidden target", visible: true, anchor: { signalId: signal.id, cycle: 1, point: "value-start" as const } }],
    };
    const map = new ImmutableLocalGeometryMap(signal.id, [{ cycle: 1, point: "value-start", position: { x: 24, y: 0 } }]);

    expect(projectAnnotationOverlays(document, projectionFor(signal.id, false), new Map([[signal.id, map]]), buildDisplayTimeMapping(document.timeline, []))).toEqual([]);
  });

  it("resolves folded anchors consistently for source-keyed and display-keyed geometry", () => {
    const source = canonicalFixture();
    const signal = source.signals[1]!;
    const document = {
      ...source,
      timeGroups: [{ id: "fold" as never, name: "Fold", start: 2, end: 4, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "2 cycles" } }],
    };
    const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
    const sourceCycles = [0, 1, 4, 5, 6, 7, 8];
    const sourceEntries = sourceCycles.flatMap((cycle) => {
      const display = mapping.sourceToDisplay(cycle) ?? mapping.displayCycleCount;
      return [
        { cycle, point: "cycle-start" as const, position: { x: display * 10, y: 0 } },
        ...(cycle === document.timeline.cycleCount ? [] : [
          { cycle, point: "row-center" as const, position: { x: display * 10 + 5, y: 0 } },
          { cycle, point: "transition-center" as const, position: { x: display * 10 + 5, y: 0 } },
        ]),
      ];
    });
    const displayEntries = Array.from({ length: mapping.displayCycleCount + 1 }, (_, cycle) => [
      { cycle, point: "cycle-start" as const, position: { x: cycle * 10, y: 0 } },
      ...(cycle === mapping.displayCycleCount ? [] : [
        { cycle, point: "row-center" as const, position: { x: cycle * 10 + 5, y: 0 } },
        { cycle, point: "transition-center" as const, position: { x: cycle * 10 + 5, y: 0 } },
      ]),
    ]).flat();
    const sourceMap = new ImmutableLocalGeometryMap(signal.id, sourceEntries, [], "source");
    const displayMap = new ImmutableLocalGeometryMap(signal.id, displayEntries, [], "display");
    const projection = projectionFor(signal.id, true);
    const anchor = { signalId: signal.id, cycle: 4, point: "cycle-start" as const };

    expect(resolveAnchorPoint(anchor, document, projection, new Map([[signal.id, sourceMap]]), mapping)).toEqual({ x: 20, y: 120 });
    expect(resolveAnchorPoint(anchor, document, projection, new Map([[signal.id, displayMap]]), mapping)).toEqual({ x: 20, y: 120 });
    expect(resolveAnchorPoint({ ...anchor, cycle: 2 }, document, projection, new Map([[signal.id, sourceMap]]), mapping)).toBeUndefined();
    expect(resolveAnchorPoint({ ...anchor, cycle: 8 }, document, projection, new Map([[signal.id, sourceMap]]), mapping)).toEqual({ x: 60, y: 120 });
    expect(resolveAnchorPoint({ ...anchor, cycle: 8 }, document, projection, new Map([[signal.id, displayMap]]), mapping)).toEqual({ x: 60, y: 120 });
    const wrongSourceFallback = new ImmutableLocalGeometryMap(signal.id, [
      { cycle: 2, point: "cycle-start", position: { x: 999, y: 0 } },
    ], [], "source");
    expect(resolveAnchorPoint(anchor, document, projection, new Map([[signal.id, wrongSourceFallback]]), mapping)).toBeUndefined();
  });

  it.each([0, 1])("keeps Ghost Trace source samples aligned across full display and bounded source geometry after a fold (offset %i)", (offset) => {
    const source = canonicalFixture();
    const signal = source.signals[1]!;
    const annotation = {
      id: "ghost-folded" as never,
      type: "ghostTrace" as const,
      label: "Folded trace",
      visible: true,
      sourceSignalId: signal.id,
      traceOffsetCycles: offset,
      start: { signalId: signal.id, cycle: 4, point: "row-center" as const },
      end: { signalId: signal.id, cycle: 6, point: "row-center" as const },
    };
    const document = {
      ...source,
      timeGroups: [{ id: "fold" as never, name: "Fold", start: 2, end: 4, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "2 cycles" } }],
      annotations: [annotation],
    };
    const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
    const sourceCycles = [0, 1, 4, 5, 6, 7, 8];
    const sourceEntries = sourceCycles.flatMap((cycle) => {
      const display = mapping.sourceToDisplay(cycle) ?? mapping.displayCycleCount;
      return [
        { cycle, point: "cycle-start" as const, position: { x: display * 10, y: 0 } },
        ...(cycle === document.timeline.cycleCount ? [] : [
          { cycle, point: "row-center" as const, position: { x: display * 10 + 5, y: 0 } },
          { cycle, point: "transition-center" as const, position: { x: display * 10 + 5, y: 0 } },
        ]),
      ];
    });
    const displayEntries = Array.from({ length: mapping.displayCycleCount + 1 }, (_, cycle) => [
      { cycle, point: "cycle-start" as const, position: { x: cycle * 10, y: 0 } },
      ...(cycle === mapping.displayCycleCount ? [] : [
        { cycle, point: "row-center" as const, position: { x: cycle * 10 + 5, y: 0 } },
        { cycle, point: "transition-center" as const, position: { x: cycle * 10 + 5, y: 0 } },
      ]),
    ]).flat();
    const projection = projectionFor(signal.id, true);
    const sourceOverlays = projectAnnotationOverlays(document, projection, new Map([[signal.id, new ImmutableLocalGeometryMap(signal.id, sourceEntries, [], "source")]]), mapping);
    const displayOverlays = projectAnnotationOverlays(document, projection, new Map([[signal.id, new ImmutableLocalGeometryMap(signal.id, displayEntries, [], "display")]]), mapping);

    const firstDisplayCycle = mapping.sourceToDisplay(4 + offset)!;
    expect(sourceOverlays[0]?.tracePoints?.map((point) => point.x)).toEqual(Array.from({ length: 3 }, (_, index) => [
      (firstDisplayCycle + index) * 10,
      (firstDisplayCycle + index) * 10 + 5,
    ]).flat());
    expect(displayOverlays[0]?.tracePoints).toEqual(sourceOverlays[0]?.tracePoints);
  });

  it("keeps a shifted Ghost Trace in the viewport candidate set when raw anchors are offscreen", () => {
    const source = canonicalFixture();
    const signal = source.signals[1]!;
    const ghost = {
      id: "ghost-shifted" as never, type: "ghostTrace" as const, label: "Shifted", visible: true,
      sourceSignalId: signal.id, traceOffsetCycles: -100,
      start: { signalId: signal.id, cycle: 120, point: "cycle-start" as const },
      end: { signalId: signal.id, cycle: 130, point: "cycle-start" as const },
    };
    const fillers = Array.from({ length: 300 }, (_, index) => ({ id: `f${index}` as never, type: "marker" as const, label: "f", visible: true }));
    const document = { ...source, timeline: { ...source.timeline, cycleCount: 200, end: 200 }, annotations: [...fillers, ghost] };
    const mapping = buildDisplayTimeMapping(document.timeline, []);
    const entries = Array.from({ length: 201 }, (_, cycle) => [
      { cycle, point: "cycle-start" as const, position: { x: cycle * 10, y: 0 } },
      ...(cycle === 200 ? [] : [{ cycle, point: "transition-center" as const, position: { x: cycle * 10 + 5, y: 0 } }]),
    ]).flat();
    const map = new ImmutableLocalGeometryMap(signal.id, entries);
    const metrics: { candidateCount?: number; indexEntriesVisited?: number } = {};
    const viewport = { sourceStart: 20, sourceEnd: 31, displayStart: 20, displayEnd: 31, overscanCycles: 0, rowStart: 0, rowEnd: 200, generation: 1, pinnedIds: [] } satisfies DisplayTimeViewport;

    const overlays = projectAnnotationOverlays(document, projectionFor(signal.id, true), new Map([[signal.id, map]]), mapping, 1, viewport, (next) => Object.assign(metrics, next));
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.id).toBe(ghost.id);
    expect(overlays[0]?.tracePoints?.length).toBeGreaterThan(0);
    expect(metrics.candidateCount).toBeLessThan(document.annotations.length);
    expect(metrics.indexEntriesVisited).toBeLessThan(document.annotations.length / 10);
  });

  it("keeps cycle-only anchors in the indexed viewport projection", () => {
    const source = canonicalFixture();
    const signal = source.signals.find((item) => item.type === "clock") ?? source.signals.find((item) => item.type !== "commentRow")!;
    const target = { id: "ann_cycle_only_visible" as never, type: "text" as const, label: "Cycle only", visible: true, anchor: { cycle: 20, point: "cycle-start" as const } };
    const fillers = Array.from({ length: 300 }, (_, index) => ({ id: `ann_no_anchor_${index}` as never, type: "marker" as const, label: "No anchor", visible: true }));
    const document = { ...source, annotations: [...fillers, target] };
    const projection = projectionFor(signal.id, true);
    const map = new ImmutableLocalGeometryMap(signal.id, [{ cycle: 20, point: "cycle-start", position: { x: 200, y: 0 } }]);
    const viewport = { sourceStart: 20, sourceEnd: 21, displayStart: 20, displayEnd: 21, overscanCycles: 0, rowStart: 0, rowEnd: 1, generation: 1, pinnedIds: [] } satisfies DisplayTimeViewport;

    const overlays = projectAnnotationOverlays(document, projection, new Map([[signal.id, map]]), buildDisplayTimeMapping(document.timeline, []), 1, viewport);

    expect(overlays.map((overlay) => overlay.id)).toEqual([target.id]);
  });
});
