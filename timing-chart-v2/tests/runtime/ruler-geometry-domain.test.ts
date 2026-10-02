import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap, type LocalGeometryEntry } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping, DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { displayBoundaryForGeometryKey, sourceBoundaryGeometryPoint } from "../../apps/editor/src/runtime/display-boundary.js";
import { TimelineGeometryOwner } from "../../apps/editor/src/runtime/timeline-geometry-owner.js";
import { renderGeometryGrid } from "../../apps/editor/src/render-geometry-grid.js";

const signalId = "sig_clock" as never;
const timeline = { cycleCount: 10, labelAnchors: [] } as never;
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
    expect(displayBoundaryForGeometryKey(2, displayGeometry, mapping)).toBe(2);
    expect(sourceBoundaryGeometryPoint(displayGeometry, signalId, 4, 2)).toEqual({ x: 100.5, y: 0 });
    expect(displayBoundaryForGeometryKey(mapping.displayCycleCount, displayGeometry, mapping)).toBe(mapping.displayCycleCount);
    expect(sourceBoundaryGeometryPoint(displayGeometry, signalId, mapping.sourceCycleCount, mapping.displayCycleCount)).toEqual({ x: 340.5, y: 0 });
  });

  it("maps source-keyed bounded boundaries to display time and excludes hidden source cycles", () => {
    const sourceGeometry = geometry("source");
    expect(displayBoundaryForGeometryKey(2, sourceGeometry, mapping)).toBeUndefined();
    expect(displayBoundaryForGeometryKey(4, sourceGeometry, mapping)).toBe(2);
    expect(sourceBoundaryGeometryPoint(sourceGeometry, signalId, 4, 2)).toEqual({ x: 100.5, y: 0 });
    expect(displayBoundaryForGeometryKey(mapping.sourceCycleCount, sourceGeometry, mapping)).toBe(mapping.displayCycleCount);
  });

  it.each(["source", "display"] as const)("renders folded grid boundaries consistently for %s-keyed geometry", (domain) => {
    const gridLines: Array<{ dataset: Record<string, string>; className: string; style: Record<string, string> }> = [];
    const grid = {
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
      ownerDocument: {
        createElement: () => {
          const line = { dataset: {} as Record<string, string>, className: "", style: {} as Record<string, string> };
          gridLines.push(line);
          return line;
        },
      },
      replaceChildren: (...children: typeof gridLines) => { gridLines.splice(0, gridLines.length, ...children); },
    } as unknown as HTMLElement;

    renderGeometryGrid(grid, geometry(domain), signalId, true, 80, mapping, undefined, 1);

    expect(gridLines).toHaveLength(mapping.displayCycleCount + 1);
    expect(gridLines.map((line) => line.style.left)).toEqual(
      Array.from({ length: mapping.displayCycleCount + 1 }, (_, displayCycle) => `${20.5 + displayCycle * 40}px`),
    );
    expect(gridLines.map((line) => line.dataset.cycle)).toEqual(
      Array.from({ length: mapping.displayCycleCount + 1 }, (_, displayCycle) => String(mapping.labelFor(displayCycle))),
    );
  });

  it.each(["source", "display"] as const)("uses one published metrics generation for %s-keyed grid X", (domain) => {
    const axisGeometry = geometry(domain);
    const document = { timeline, timeGroups, signals: [] } as never;
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[signalId, axisGeometry]]),
      getDocument: () => document,
      getProjection: () => ({} as never),
      onSnapIndexBuilt: () => undefined,
    });
    const metrics = owner.updatePresentation({ mode: "reference-clock", ownerSignalId: signalId, geometry: axisGeometry }, 2);
    const gridLines: Array<{ dataset: Record<string, string>; className: string; style: Record<string, string> }> = [];
    const grid = {
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
      ownerDocument: {
        createElement: () => {
          const line = { dataset: {} as Record<string, string>, className: "", style: {} as Record<string, string> };
          gridLines.push(line);
          return line;
        },
      },
      replaceChildren: (...children: typeof gridLines) => { gridLines.splice(0, gridLines.length, ...children); },
      closest: () => null,
    } as unknown as HTMLElement;

    // A contradictory scalar fallback proves this consumer takes its X and
    // presentation scale from the immutable generation, not separately passed values.
    renderGeometryGrid(grid, axisGeometry, signalId, true, 80, mapping, undefined, 1, "reference-clock", 1, metrics);

    expect(gridLines.map((line) => line.style.left)).toEqual(
      Array.from({ length: mapping.displayCycleCount + 1 }, (_, displayCycle) => `${(20.5 + displayCycle * 40) * 2}px`),
    );
  });
});
