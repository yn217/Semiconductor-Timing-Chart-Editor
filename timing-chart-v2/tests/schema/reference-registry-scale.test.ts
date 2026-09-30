import { describe, expect, it } from "vitest";
import { canonicalReferenceMetrics, canonicalReferences, referencesToAny } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "../../packages/testing/src/index.js";

describe("canonical reference index scaling", () => {
  it("enumerates the large registry once, then visits only requested target buckets", () => {
    const base = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 500 });
    const document = {
      ...base,
      annotations: Array.from({ length: 20_000 }, (_, index) => {
        const signalId = base.signals[index % base.signals.length]!.id;
        const start = index % 498;
        return {
          id: `ann_refscale_${index}` as never,
          type: "measurement" as const,
          label: `M${index}`,
          visible: true,
          start: { signalId, cycle: start, point: "cycle-start" as const },
          end: { signalId, cycle: start + 2, point: "cycle-end" as const },
        };
      }),
      transactions: Array.from({ length: 10_000 }, (_, index) => {
        const start = index % 496;
        return {
          id: `txn_refscale_${index}` as never,
          name: `T${index}`,
          start,
          end: start + 4,
          laneId: `lane_${index % 8}`,
          linkedSignals: [base.signals[index]!.id],
        };
      }),
    };
    const targets = [base.signals[0]!.id, base.signals[9_999]!.id];
    const expectedReferenceCount = canonicalReferences(document).length;
    const before = canonicalReferenceMetrics();

    const first = referencesToAny(document, "signal", targets);
    const second = referencesToAny(document, "signal", targets);
    const after = canonicalReferenceMetrics();

    expect(first.length).toBeLessThan(20);
    expect(second).toEqual(first);
    expect(after.indexBuilds - before.indexBuilds).toBe(1);
    expect(after.referencesEnumerated - before.referencesEnumerated).toBe(expectedReferenceCount);
    expect(after.targetQueries - before.targetQueries).toBe(2);
    expect(after.referencesVisited - before.referencesVisited).toBe(first.length * 2);
  });
});
