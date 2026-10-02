import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap, type LocalGeometryEntry } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping } from "@timing-chart-v2/projection";
import { rulerBoundaryPoint, rulerDisplayCycleForGeometryKey } from "../../apps/editor/src/runtime/build-ruler.js";

const signalId = "sig_clock" as never;
const timeline = { cycleCount: 10 } as never;
const timeGroups = [{ id: "fold", name: "Fold", start: 2, end: 4, presentation: { collapsed: true } }] as never;
const mapping = buildDisplayTimeMapping(timeline, timeGroups);

function geometry(domain: "source" | "display"): ImmutableLocalGeometryMap {
  const cycles = domain === "display" ? Array.from({ length: mapping.displayCycleCount + 1 }, (_, cycle) => cycle) : [0, 1, 4, 5, 6, 7, 8, 9, 10];
  const entries: LocalGeometryEntry[] = cycles.map((cycle, index) => ({ cycle, point: "cycle-start", position: { x: 20.5 + index * 40, y: 0 } }));
  return new ImmutableLocalGeometryMap(signalId, entries, [], domain);
}

describe("ruler geometry cycle-key domains", () => {
  it("keeps display-keyed full-fold boundaries in display space and resolves canonical source anchors through the mapping", () => {
    const displayGeometry = geometry("display");
    expect(mapping.sourceToDisplay(2)).toBeUndefined();
    expect(rulerDisplayCycleForGeometryKey(2, displayGeometry, mapping, mapping.sourceCycleCount)).toBe(2);
    expect(rulerBoundaryPoint(displayGeometry, signalId, 4, 2)).toEqual({ x: 100.5, y: 0 });
    expect(rulerDisplayCycleForGeometryKey(mapping.displayCycleCount, displayGeometry, mapping, mapping.sourceCycleCount)).toBe(mapping.displayCycleCount);
    expect(rulerBoundaryPoint(displayGeometry, signalId, mapping.sourceCycleCount, mapping.displayCycleCount)).toEqual({ x: 340.5, y: 0 });
  });

  it("maps source-keyed bounded boundaries to display time and excludes hidden source cycles", () => {
    const sourceGeometry = geometry("source");
    expect(rulerDisplayCycleForGeometryKey(2, sourceGeometry, mapping, mapping.sourceCycleCount)).toBeUndefined();
    expect(rulerDisplayCycleForGeometryKey(4, sourceGeometry, mapping, mapping.sourceCycleCount)).toBe(2);
    expect(rulerBoundaryPoint(sourceGeometry, signalId, 4, 2)).toEqual({ x: 100.5, y: 0 });
    expect(rulerDisplayCycleForGeometryKey(mapping.sourceCycleCount, sourceGeometry, mapping, mapping.sourceCycleCount)).toBe(mapping.displayCycleCount);
  });
});
