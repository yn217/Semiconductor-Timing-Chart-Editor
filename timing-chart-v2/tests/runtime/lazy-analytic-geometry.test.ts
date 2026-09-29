import { describe, expect, it } from "vitest";
import { analyticLocalGeometry, toWaveJson } from "@timing-chart-v2/wavedrom-adapter";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { LazyAnalyticGeometryMap } from "../../apps/editor/src/runtime/lazy-analytic-geometry.js";

describe("lazy analytic geometry", () => {
  it("preserves cycle, edge, and transition anchors when detailed geometry is requested", () => {
    const document = generatePerformanceDocument({ signalCount: 2, cycleCount: 12 });
    const signal = document.signals.find((item) => item.type !== "clock")!;
    const waveJson = toWaveJson({ signal, cycleCount: document.timeline.cycleCount });
    const sourceCycles = Object.freeze(Array.from({ length: 13 }, (_, index) => index));
    const eager = analyticLocalGeometry(signal.id, waveJson);
    const lazy = new LazyAnalyticGeometryMap(signal.id, waveJson, sourceCycles);

    for (let cycle = 0; cycle <= 12; cycle += 1) {
      for (const point of ["cycle-start", "cycle-center", "value-center", "row-center", "cycle-end"] as const) {
        expect(lazy.find({ signalId: signal.id, cycle, point })).toEqual(eager.find({ signalId: signal.id, cycle, point }));
      }
    }
    for (const point of ["rising-edge", "falling-edge", "transition-start", "transition-center", "transition-end"] as const) {
      for (let cycle = 0; cycle <= 12; cycle += 1) {
        expect(lazy.find({ signalId: signal.id, cycle, point })).toEqual(eager.find({ signalId: signal.id, cycle, point }));
      }
    }
    expect(lazy.edgeEntries()).toEqual(eager.edgeEntries());
  });
});
