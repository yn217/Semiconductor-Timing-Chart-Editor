import { describe, expect, it } from "vitest";
import type { RenderProjection } from "@timing-chart-v2/projection";
import { projectionForActiveWaveView } from "../../apps/editor/src/runtime/view-mode-wave-invalidation.js";

describe("projectionForActiveWaveView", () => {
  it("requeues visible waveforms when Cycle or Combined is activated", () => {
    const projection = {
      mountedSignalIds: ["clock", "reset", "request"],
      waveSignalIds: [],
    } as unknown as RenderProjection;

    expect(projectionForActiveWaveView(projection, "Cycle").waveSignalIds).toEqual(["clock", "reset", "request"]);
    expect(projectionForActiveWaveView(projection, "Split").waveSignalIds).toEqual(["clock", "reset", "request"]);
  });

  it("does not force Cycle-only waveform work in Transaction mode", () => {
    const projection = {
      mountedSignalIds: ["clock", "reset", "request"],
      waveSignalIds: [],
    } as unknown as RenderProjection;

    expect(projectionForActiveWaveView(projection, "Transaction")).toBe(projection);
  });
});
