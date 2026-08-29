import { describe, expect, it } from "vitest";
import { buildDisplayTimeMapping, DisplayTimeMappingCache, remapValueChangesToDisplay } from "@timing-chart-v2/projection";
import type { TimeGroup, TimeGroupId, Timeline } from "@timing-chart-v2/schema";

function timeline(cycleCount: number, labelAnchors: Timeline["labelAnchors"] = []): Pick<Timeline, "cycleCount" | "labelAnchors"> {
  return { cycleCount, labelAnchors };
}

function collapsedGroup(id: string, start: number, end: number): TimeGroup {
  return { id: id as TimeGroupId, name: id, start, end, presentation: { collapsed: true } };
}

describe("buildDisplayTimeMapping", () => {
  it("is the identity mapping when there are no collapsed TimeGroups", () => {
    const mapping = buildDisplayTimeMapping(timeline(10), []);
    expect(mapping.displayCycleCount).toBe(10);
    expect(mapping.displayToSource).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(mapping.labelFor(4)).toBe(4);
  });

  it("removes a collapsed cycle range entirely from display space", () => {
    // source cycles 0..19; collapse [5, 15) — 10 hidden cycles
    const mapping = buildDisplayTimeMapping(timeline(20), [collapsedGroup("g1", 5, 15)]);
    expect(mapping.displayCycleCount).toBe(10); // 20 - 10 hidden
    expect(mapping.sourceToDisplay[4]).toBe(4);
    expect(mapping.sourceToDisplay[5]).toBeUndefined();
    expect(mapping.sourceToDisplay[14]).toBeUndefined();
    expect(mapping.sourceToDisplay[15]).toBe(5); // first cycle after the gap
    expect(mapping.displayToSource[5]).toBe(15);
    expect(mapping.displayToSource[9]).toBe(19);
    expect(mapping.labelFor(mapping.displayCycleCount)).toBe(20);
  });

  it("handles multiple non-overlapping collapsed ranges", () => {
    const mapping = buildDisplayTimeMapping(timeline(30), [collapsedGroup("g1", 20, 25), collapsedGroup("g2", 5, 10)]);
    expect(mapping.displayCycleCount).toBe(30 - 5 - 5);
    expect(mapping.sourceToDisplay[4]).toBe(4);
    expect(mapping.sourceToDisplay[10]).toBe(5);
    expect(mapping.sourceToDisplay[19]).toBe(14);
    expect(mapping.sourceToDisplay[25]).toBe(15);
  });

  it("merges overlapping collapsed ranges while preserving the half-open mapping", () => {
    const mapping = buildDisplayTimeMapping(timeline(20), [collapsedGroup("g1", 4, 10), collapsedGroup("g2", 8, 14)]);
    expect(mapping.displayCycleCount).toBe(10);
    expect(mapping.sourceToDisplay[3]).toBe(3);
    expect(mapping.sourceToDisplay[4]).toBeUndefined();
    expect(mapping.sourceToDisplay[13]).toBeUndefined();
    expect(mapping.sourceToDisplay[14]).toBe(4);
    expect(mapping.displayToSource[4]).toBe(14);
  });

  it("uses source as the canonical anchor position and display as its ruler label", () => {
    const mapping = buildDisplayTimeMapping(timeline(20, [{ id: "la1" as never, source: 15, display: 1000 }]), [collapsedGroup("g1", 5, 15)]);
    expect(mapping.labelFor(5)).toBe(1000);
    expect(mapping.labelFor(4)).toBe(4);
  });
});

describe("DisplayTimeMappingCache", () => {
  it("reuses a mapping when mapping-relevant timeline and fold state are unchanged", () => {
    const cache = new DisplayTimeMappingCache();
    const first = cache.get(timeline(12), [collapsedGroup("g1", 4, 8)]);
    const second = cache.get(timeline(12), [collapsedGroup("g1", 4, 8)]);

    expect(second).toBe(first);
    const metrics = cache.metrics();
    expect(metrics.builds).toBe(1);
    expect(metrics.hits).toBe(1);
    expect(metrics.sourceCyclesVisited).toBe(12);
    expect(metrics.foldRangesVisited).toBe(1);
    expect(metrics.buildDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("ignores unrelated TimeGroup fields while invalidating on fold geometry", () => {
    const cache = new DisplayTimeMappingCache();
    const first = cache.get(timeline(12), [{ ...collapsedGroup("g1", 4, 8), name: "Initial" }]);
    const renamed = cache.get(timeline(12), [{ ...collapsedGroup("g1", 4, 8), name: "Renamed" }]);
    const moved = cache.get(timeline(12), [{ ...collapsedGroup("g1", 5, 8), name: "Renamed" }]);

    expect(renamed).toBe(first);
    expect(moved).not.toBe(first);
    expect(cache.metrics().builds).toBe(2);
    expect(cache.metrics().hits).toBe(1);
    expect(cache.metrics().sourceCyclesVisited).toBe(24);
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
});
