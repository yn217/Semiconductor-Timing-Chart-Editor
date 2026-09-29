import { describe, expect, it } from "vitest";
import { allocateMeasurementLanes, type MeasurementLaneAllocationMetrics, type MeasurementLaneSpan } from "@timing-chart-v2/geometry";

function legacyAllocateMeasurementLanes(spans: readonly MeasurementLaneSpan[]): ReadonlyMap<string, number> {
  const laneById = new Map<string, number>();
  const laneEnds: number[] = [];
  for (const span of spans) {
    const startX = Math.min(span.firstX, span.secondX);
    const endX = Math.max(span.firstX, span.secondX);
    const firstFreeLane = laneEnds.findIndex((end) => end <= startX);
    const lane = span.explicitLane ?? (firstFreeLane >= 0 ? firstFreeLane : laneEnds.length);
    laneById.set(span.id, lane);
    laneEnds[lane] = Math.max(laneEnds[lane] ?? Number.NEGATIVE_INFINITY, endX);
  }
  return laneById;
}

describe("Measurement lane allocation", () => {
  it("preserves input-order, lowest-free and explicit-lane placement", () => {
    const spans: MeasurementLaneSpan[] = [
      { id: "a", firstX: 0, secondX: 5 },
      { id: "b", firstX: 0, secondX: 2 },
      { id: "c", firstX: 2, secondX: 6 },
      { id: "explicit", firstX: 3, secondX: 10, explicitLane: 4 },
      { id: "d", firstX: 5, secondX: 8 },
      { id: "reverse", firstX: 12, secondX: 9 },
      { id: "high-explicit", firstX: 1, secondX: 3, explicitLane: 8 },
      { id: "after-high-explicit", firstX: 2, secondX: 4 },
    ];
    expect(allocateMeasurementLanes(spans)).toEqual(legacyAllocateMeasurementLanes(spans));
  });

  it("matches the legacy placement for unsorted mixed automatic and explicit spans", () => {
    let state = 0x51a7;
    const next = (): number => { state = (state * 1664525 + 1013904223) >>> 0; return state; };
    const spans = Array.from({ length: 500 }, (_, index) => {
      const firstX = next() % 100;
      const secondX = firstX + (next() % 18);
      return { id: `r${index}`, firstX, secondX, ...(index % 11 === 0 ? { explicitLane: next() % 12 } : {}) };
    });
    expect(allocateMeasurementLanes(spans)).toEqual(legacyAllocateMeasurementLanes(spans));
  });

  it("uses sub-quadratic lane comparisons for heavily overlapping spans", () => {
    const count = 20_000;
    const spans = Array.from({ length: count }, (_, index) => ({ id: `m${index}`, firstX: 0, secondX: 100 }));
    const metrics: MeasurementLaneAllocationMetrics = { spansVisited: 0, indexOperations: 0, laneComparisons: 0, allocatedLanes: 0, explicitLanes: 0, durationMs: 0 };

    const lanes = allocateMeasurementLanes(spans, metrics);

    expect(lanes.size).toBe(count);
    expect(metrics.spansVisited).toBe(count);
    expect(metrics.allocatedLanes).toBe(count);
    const treeHeight = Math.ceil(Math.log2(count));
    expect(metrics.laneComparisons).toBe(count * treeHeight);
    expect(metrics.indexOperations).toBe(count * (2 * treeHeight + 1));
  });

  it("reuses one lane for 20,000 sequential non-overlapping spans", () => {
    const count = 20_000;
    const spans = Array.from({ length: count }, (_, index) => ({ id: `sequential${index}`, firstX: index * 2, secondX: index * 2 + 1 }));
    const lanes = allocateMeasurementLanes(spans);

    expect(lanes.size).toBe(count);
    expect(new Set(lanes.values())).toEqual(new Set([0]));
  });

  it("keeps sparse explicit lane indices from expanding the index storage", () => {
    const explicit = 1_000_000_000;
    const lanes = allocateMeasurementLanes([
      { id: "authored", firstX: 0, secondX: 10, explicitLane: explicit },
      { id: "automatic", firstX: 1, secondX: 9 },
    ]);
    expect(lanes.get("authored")).toBe(explicit);
    expect(lanes.get("automatic")).toBe(explicit + 1);
  });
});
