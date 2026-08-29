import { describe, expect, it } from "vitest";
import { createGeometryEntryAccumulator } from "@timing-chart-v2/wavedrom-adapter";

describe("Local Geometry entry accumulation", () => {
  it("deduplicates by semantic key without scanning prior entries", () => {
    const accumulator = createGeometryEntryAccumulator();
    const count = 10_000;

    for (let cycle = 0; cycle < count; cycle += 1) {
      accumulator.add(cycle, "cycle-start", { x: cycle, y: 1 });
    }
    for (let cycle = 0; cycle < count; cycle += 1) {
      accumulator.add(cycle, "cycle-start", { x: -1, y: -1 });
    }

    expect(accumulator.entries()).toHaveLength(count);
    expect(accumulator.metrics()).toEqual({ geometryEntriesEmitted: count, duplicateKeyChecks: count * 2, duplicateKeyCollisions: count });
    expect(accumulator.entries()[0]).toEqual({ cycle: 0, point: "cycle-start", position: { x: 0, y: 1 } });
    expect(accumulator.entries()[count - 1]).toEqual({ cycle: count - 1, point: "cycle-start", position: { x: count - 1, y: 1 } });
  });

  it("keeps threshold anchors distinct while preserving first-write semantics", () => {
    const accumulator = createGeometryEntryAccumulator();
    accumulator.add(3, "transition-center", { x: 10, y: 20 });
    accumulator.add(3, "transition-center", { x: 30, y: 40 }, 0.3);
    accumulator.add(3, "transition-center", { x: 50, y: 60 }, 0.7);
    accumulator.add(3, "transition-center", { x: 99, y: 99 }, 0.3);

    expect(accumulator.metrics()).toEqual({ geometryEntriesEmitted: 3, duplicateKeyChecks: 4, duplicateKeyCollisions: 1 });

    expect(accumulator.entries()).toEqual([
      { cycle: 3, point: "transition-center", position: { x: 10, y: 20 } },
      { cycle: 3, point: "transition-center", threshold: 0.3, position: { x: 30, y: 40 } },
      { cycle: 3, point: "transition-center", threshold: 0.7, position: { x: 50, y: 60 } },
    ]);
  });
});
