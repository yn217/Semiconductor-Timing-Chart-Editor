import { describe, expect, it, vi } from "vitest";
import { buildDisplayTimeMapping, DisplayTimeMappingCache, remapValueChangesToDisplay, resolveSourcePosition } from "@timing-chart-v2/projection";
import type { DisplayTimeMapping } from "@timing-chart-v2/projection";
import type { TimeGroup, TimeGroupId, Timeline } from "@timing-chart-v2/schema";

function timeline(cycleCount: number, labelAnchors: Timeline["labelAnchors"] = []): Pick<Timeline, "cycleCount" | "labelAnchors"> {
  return { cycleCount, labelAnchors };
}

function collapsedGroup(id: string, start: number, end: number): TimeGroup {
  return { id: id as TimeGroupId, name: id, start, end, presentation: { collapsed: true } };
}

describe("buildDisplayTimeMapping", () => {
  it("interpolates fractional source positions through the shared mapping", () => {
    const mapping = buildDisplayTimeMapping(timeline(10), []);
    expect(resolveSourcePosition(mapping, 1.5, "interpolate")).toBe(1.5);
  });

  it("resolves fractional positions around a collapsed range without pixel fallback", () => {
    const mapping = buildDisplayTimeMapping(timeline(20), [collapsedGroup("g1", 5, 10)]);
    expect(resolveSourcePosition(mapping, 3.5, "interpolate")).toBe(3.5);
    expect(resolveSourcePosition(mapping, 10.5, "interpolate")).toBe(5.5);
  });

  it("resolves floor and ceil through a wide folded range without scanning its hidden cycles", () => {
    const mapping = buildDisplayTimeMapping(timeline(100_000), [collapsedGroup("g1", 10, 99_990)]);
    expect(resolveSourcePosition(mapping, 50_000, "floor")).toBe(9);
    expect(resolveSourcePosition(mapping, 50_000, "ceil")).toBe(10);
  });

  it("uses the shared source-boundary index directly for floor/ceil instead of searching display cycles", () => {
    const displayToSource = vi.fn(() => undefined);
    const displayBoundaryAtOrAfterSource = vi.fn((_cycle: number) => 10);
    const mapping: DisplayTimeMapping = {
      sourceCycleCount: 100_000,
      displayCycleCount: 100,
      isIdentity: false,
      sourceToDisplay: () => undefined,
      displayToSource,
      displayBoundaryAtOrAfterSource,
      collapsedGroupAtSource: () => undefined,
      labelFor: (cycle) => cycle,
    };

    expect(resolveSourcePosition(mapping, 50_000, "floor")).toBe(9);
    expect(resolveSourcePosition(mapping, 50_000, "ceil")).toBe(10);
    expect(displayBoundaryAtOrAfterSource.mock.calls).toEqual([[50_001], [50_000]]);
    expect(displayToSource).not.toHaveBeenCalled();
  });
  it("is the identity mapping when there are no collapsed TimeGroups", () => {
    const mapping = buildDisplayTimeMapping(timeline(10), []);
    expect(mapping.displayCycleCount).toBe(10);
    expect(Array.from({ length: mapping.displayCycleCount }, (_, display) => mapping.displayToSource(display))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(mapping.labelFor(4)).toBe(4);
  });

  it("removes a collapsed cycle range entirely from display space", () => {
    // source cycles 0..19; collapse [5, 15) — 10 hidden cycles
    const mapping = buildDisplayTimeMapping(timeline(20), [collapsedGroup("g1", 5, 15)]);
    expect(mapping.displayCycleCount).toBe(10); // 20 - 10 hidden
    expect(mapping.sourceToDisplay(4)).toBe(4);
    expect(mapping.sourceToDisplay(5)).toBeUndefined();
    expect(mapping.sourceToDisplay(14)).toBeUndefined();
    expect(mapping.sourceToDisplay(15)).toBe(5); // first cycle after the gap
    expect(mapping.displayToSource(5)).toBe(15);
    expect(mapping.displayToSource(9)).toBe(19);
    expect(mapping.labelFor(mapping.displayCycleCount)).toBe(20);
  });

  it("handles multiple non-overlapping collapsed ranges", () => {
    const mapping = buildDisplayTimeMapping(timeline(30), [collapsedGroup("g1", 20, 25), collapsedGroup("g2", 5, 10)]);
    expect(mapping.displayCycleCount).toBe(30 - 5 - 5);
    expect(mapping.sourceToDisplay(4)).toBe(4);
    expect(mapping.sourceToDisplay(10)).toBe(5);
    expect(mapping.sourceToDisplay(19)).toBe(14);
    expect(mapping.sourceToDisplay(25)).toBe(15);
  });

  it("merges overlapping collapsed ranges while preserving the half-open mapping", () => {
    const mapping = buildDisplayTimeMapping(timeline(20), [collapsedGroup("g1", 4, 10), collapsedGroup("g2", 8, 14)]);
    expect(mapping.displayCycleCount).toBe(10);
    expect(mapping.sourceToDisplay(3)).toBe(3);
    expect(mapping.sourceToDisplay(4)).toBeUndefined();
    expect(mapping.sourceToDisplay(13)).toBeUndefined();
    expect(mapping.sourceToDisplay(14)).toBe(4);
    expect(mapping.displayToSource(4)).toBe(14);
  });

  it("resolves the canonical first collapsed group through an indexed half-open lookup", () => {
    const parent = { ...collapsedGroup("parent", 4, 16), parentId: undefined };
    const child = { ...collapsedGroup("child", 8, 12), parentId: "parent" as TimeGroupId };
    const adjacent = collapsedGroup("adjacent", 16, 20);
    const mapping = buildDisplayTimeMapping(timeline(24), [parent, child, adjacent]);

    expect(mapping.collapsedGroupAtSource(3)).toBeUndefined();
    expect(mapping.collapsedGroupAtSource(8)?.id).toBe("parent");
    expect(mapping.collapsedGroupAtSource(15)?.id).toBe("parent");
    expect(mapping.collapsedGroupAtSource(16)?.id).toBe("adjacent");
    expect(mapping.collapsedGroupAtSource(20)).toBeUndefined();
  });

  it("uses source as the canonical anchor position and display as its ruler label", () => {
    const mapping = buildDisplayTimeMapping(timeline(20, [{ id: "la1" as never, source: 15, display: 1000 }]), [collapsedGroup("g1", 5, 15)]);
    expect(mapping.labelFor(5)).toBe(1000);
    expect(mapping.labelFor(6)).toBe(1001);
    expect(mapping.labelFor(4)).toBe(4);
  });

  it("honors source-to-display LabelAnchors on the no-fold identity geometry path", () => {
    const mapping = buildDisplayTimeMapping(timeline(10, [{ id: "la1" as never, source: 5, display: 100 }]), []);
    expect(mapping.isIdentity).toBe(true);
    expect(mapping.labelFor(4)).toBe(4);
    expect(mapping.labelFor(5)).toBe(100);
    expect(mapping.labelFor(6)).toBe(101);
    expect(mapping.labelFor(10)).toBe(105);
  });

  it("uses the latest source anchor for each piecewise label segment", () => {
    const mapping = buildDisplayTimeMapping(timeline(10, [
      { id: "la1" as never, source: 3, display: 100 },
      { id: "la2" as never, source: 7, display: 200 },
    ]), []);
    expect([3, 4, 6, 7, 8].map((cycle) => mapping.labelFor(cycle))).toEqual([100, 101, 103, 200, 201]);
  });

  it("resolves repeated ruler labels from one cached sorted anchor index", () => {
    const anchors = [
      { id: "la_late" as never, source: 700, display: 2000 },
      { id: "la_early" as never, source: 100, display: 500 },
      { id: "la_middle" as never, source: 400, display: 1000 },
    ];
    const mapping = buildDisplayTimeMapping(timeline(1000, anchors), []);
    expect(Array.from({ length: 5 }, (_, index) => mapping.labelFor([99, 100, 399, 400, 701][index]!))).toEqual([99, 500, 799, 1000, 2001]);
  });
});

describe("DisplayTimeMappingCache", () => {
  it("reuses a mapping when mapping-relevant timeline and fold state are unchanged", () => {
    const cache = new DisplayTimeMappingCache();
    const sourceTimeline = timeline(12);
    const groups = [collapsedGroup("g1", 4, 8)];
    const first = cache.get(sourceTimeline, groups);
    const second = cache.get(sourceTimeline, groups);

    expect(second).toBe(first);
    const metrics = cache.metrics();
    expect(metrics.builds).toBe(1);
    expect(metrics.hits).toBe(1);
    expect(metrics.sourceCyclesVisited).toBe(0);
    expect(metrics.foldRangesVisited).toBe(1);
    expect(metrics.buildDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.buildDurationMedianMs).toBe(metrics.buildDurationMs);
    expect(metrics.buildDurationP95Ms).toBe(metrics.buildDurationMs);
    expect(metrics.valueRemapPasses).toBe(0);
    expect(metrics.identityFastPathHits).toBe(0);
  });

  it("skips semantic key serialization for repeated immutable input identities", () => {
    const cache = new DisplayTimeMappingCache();
    const sourceTimeline = timeline(100_000, []);
    const groups = [collapsedGroup("g1", 40, 80)];
    const first = cache.get(sourceTimeline, groups);
    const second = cache.get(sourceTimeline, groups);

    expect(second).toBe(first);
    expect(cache.metrics()).toMatchObject({ builds: 1, hits: 1, mappingKeyBuilds: 0 });
  });

  it("rebuilds for any replacement TimeGroup collection so group owner metadata cannot go stale", () => {
    const cache = new DisplayTimeMappingCache();
    const sourceTimeline = timeline(12);
    const initialGroups = [{ ...collapsedGroup("g1", 4, 8), name: "Initial" }];
    const first = cache.get(sourceTimeline, initialGroups);
    const renamedGroups = [{ ...collapsedGroup("g1", 4, 8), name: "Renamed" }];
    const renamed = cache.get(sourceTimeline, renamedGroups);
    const movedGroups = [{ ...collapsedGroup("g1", 5, 8), name: "Renamed" }];
    const moved = cache.get(sourceTimeline, movedGroups);

    expect(renamed).not.toBe(first);
    expect(moved).not.toBe(first);
    expect(cache.metrics().builds).toBe(3);
    expect(cache.metrics().hits).toBe(0);
    expect(renamed.collapsedGroupAtSource(5)?.name).toBe("Renamed");
    expect(cache.metrics().sourceCyclesVisited).toBe(0);
  });

  it("counts remap work separately from the identity fast path", () => {
    const cache = new DisplayTimeMappingCache();
    const identity = cache.get(timeline(4), []);
    const folded = cache.get(timeline(4), [collapsedGroup("g1", 1, 2)]);
    const values = [{ start: 0, value: 0 }, { start: 2, value: 1 }];
    expect(cache.remapValueChanges(values, identity)).toBe(values);
    cache.remapValueChanges(values, folded);
    expect(cache.metrics()).toMatchObject({ valueRemapPasses: 1, identityFastPathHits: 1 });
  });

  it("records bounded scale evidence for 100k cycles and 1k folds", () => {
    const cache = new DisplayTimeMappingCache();
    const identity = cache.get(timeline(100_000), []);
    const folds = Array.from({ length: 1000 }, (_, index) => collapsedGroup(`fold-${index}`, index * 100, index * 100 + 1));
    const mapping = cache.get(timeline(100_000), folds);
    const metrics = cache.metrics();

    expect(identity.isIdentity).toBe(true);
    expect(mapping.displayCycleCount).toBe(99_000);
    expect(metrics.builds).toBe(2);
    expect(metrics.sourceCyclesVisited).toBe(0);
    expect(metrics.foldRangesVisited).toBe(1_000);
    expect(Number.isFinite(metrics.buildDurationMs)).toBe(true);
    expect(metrics.buildDurationP95Ms).toBeGreaterThanOrEqual(metrics.buildDurationMedianMs);
  });

  it("round-trips source/display conversion with interval work instead of cycle-sized storage", () => {
    const cycleCount = 100_000;
    const folds = [collapsedGroup("early", 100, 900), collapsedGroup("late", 70_000, 99_000)];
    const mapping = buildDisplayTimeMapping(timeline(cycleCount), folds);

    expect(mapping.sourceCycleCount).toBe(cycleCount);
    expect(mapping.displayCycleCount).toBe(70_200);
    for (const source of [0, 99, 900, 901, 69_999, 99_000, 99_999]) {
      const display = mapping.sourceToDisplay(source);
      expect(display).toBeDefined();
      expect(mapping.displayToSource(display!)).toBe(source);
    }
    expect(mapping.sourceToDisplay(100)).toBeUndefined();
    expect(mapping.displayBoundaryAtOrAfterSource(50_000)).toBe(49_200);
    expect(mapping.displayBoundaryAtOrAfterSource(80_000)).toBe(69_200);
  });
});

describe("remapValueChangesToDisplay", () => {
  it("passes value changes through unchanged for the identity mapping", () => {
    const mapping = buildDisplayTimeMapping(timeline(10), []);
    const values = [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }];
    expect(mapping.isIdentity).toBe(true);
    expect(remapValueChangesToDisplay(values, mapping)).toBe(values);
  });

  it("resamples value changes so a change hidden inside a collapsed range appears at the display boundary", () => {
    // source: 0..0(from 0) -> 1(from 3) -> 0(from 7), collapse [5,10)
    const mapping = buildDisplayTimeMapping(timeline(12), [collapsedGroup("g1", 5, 10)]);
    const values = [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }];
    // display cycles: 0,1,2,3,4 map to source 0..4; display 5,6 map to source 10,11
    // active value at source 4 is "1" (from start:3); active value at source 10/11 is "0" (from start:7, hidden inside the collapse)
    const remapped = remapValueChangesToDisplay(values, mapping);
    expect(remapped).toEqual([{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 5, value: 0 }]);
  });

  it("drops redundant consecutive display entries with the same active value", () => {
    const mapping = buildDisplayTimeMapping(timeline(10), [collapsedGroup("g1", 2, 8)]);
    const values = [{ start: 0, value: 0 }, { start: 3, value: 1 }];
    // display cycles: 0,1 -> source 0,1 (value 0); display 2,3 -> source 8,9 (value 1, since 3<=8)
    expect(remapValueChangesToDisplay(values, mapping)).toEqual([{ start: 0, value: 0 }, { start: 2, value: 1 }]);
  });

  it("maps only sparse changes and keeps the last value hidden by a wide fold", () => {
    const mapping = buildDisplayTimeMapping(timeline(100), [collapsedGroup("g1", 10, 90)]);
    const values = [
      { start: 0, value: "a" },
      { start: 2, value: "b" },
      { start: 20, value: "c" },
      { start: 40, value: "d" },
      { start: 89, value: "e" },
      { start: 91, value: "f" },
    ];

    expect(remapValueChangesToDisplay(values, mapping)).toEqual([
      { start: 0, value: "a" },
      { start: 2, value: "b" },
      { start: 10, value: "e" },
      { start: 11, value: "f" },
    ]);
  });

  it("remaps sparse changes through the shared source-boundary API, without searching display cycles", () => {
    const mapping = buildDisplayTimeMapping(timeline(100_000), [collapsedGroup("g1", 10, 99_990)]);
    const boundaryOnly = {
      ...mapping,
      displayToSource: (_displayCycle: number): never => { throw new Error("sparse remap must not search display cycles"); },
    };
    expect(remapValueChangesToDisplay([{ start: 0, value: 0 }, { start: 50_000, value: 1 }, { start: 99_991, value: 0 }], boundaryOnly)).toEqual([
      { start: 0, value: 0 },
      { start: 10, value: 1 },
      { start: 11, value: 0 },
    ]);
  });
});
