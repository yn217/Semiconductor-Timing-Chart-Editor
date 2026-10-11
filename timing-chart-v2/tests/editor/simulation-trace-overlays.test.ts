import { describe, expect, it, vi } from "vitest";
import { buildDisplayTimeMapping, type DisplayTimeViewport, type RenderProjection } from "@timing-chart-v2/projection";
import type { SignalId } from "@timing-chart-v2/schema";
import { projectSimulationTraceOverlays } from "../../apps/editor/src/runtime/simulation-trace-overlays.js";
import type { SimulationTraceSnapshot } from "../../apps/editor/src/simulation/simulation-trace.js";

const signalId = "sig_data" as SignalId;
const viewport: DisplayTimeViewport = { sourceStart: 0, sourceEnd: 10, displayStart: 0, displayEnd: 10, overscanCycles: 0, rowStart: 0, rowEnd: 50, generation: 1, pinnedIds: [] };

function projection(rowId = signalId): RenderProjection {
  return { rowLayout: [{ rowId, kind: "timing", visible: true, y: 10, height: 20 }], totalHeight: 40 } as unknown as RenderProjection;
}

function trace(documentEpoch = 3): SimulationTraceSnapshot {
  return {
    documentEpoch,
    signal: {
      signalId,
      signalName: "data",
      width: 1,
      events: [
        { cycle: { numerator: 0n, denominator: 1n }, value: "0" },
        { cycle: { numerator: 2n, denominator: 1n }, value: "1" },
        { cycle: { numerator: 4n, denominator: 1n }, value: "0" },
        { cycle: { numerator: 6n, denominator: 1n }, value: "1" },
        { cycle: { numerator: 8n, denominator: 1n }, value: "0" },
      ],
    },
  };
}

describe("VCD simulation trace overlay projection", () => {
  it("projects a stable signal row through shared X geometry and clips to the display viewport", () => {
    const sourceBoundaryToContentX = vi.fn((cycle: number) => cycle * 10);
    const overlays = projectSimulationTraceOverlays(trace(), projection(), {
      mapping: buildDisplayTimeMapping({ cycleCount: 10, labelAnchors: [] }, []),
      sourceBoundaryToContentX,
    }, { ...viewport, sourceStart: 2, sourceEnd: 7, displayStart: 2, displayEnd: 7 }, 3);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ signalId, signalName: "data", sourceStart: 2, sourceEnd: 7 });
    expect(overlays[0]!.path).toContain("M20");
    expect(overlays[0]!.path).toContain("H70");
    expect(sourceBoundaryToContentX).toHaveBeenCalledWith(2);
    expect(sourceBoundaryToContentX).toHaveBeenCalledWith(7);
  });

  it("starts a separate path after a collapsed fold and never projects hidden-cycle transitions", () => {
    const mapping = buildDisplayTimeMapping(
      { cycleCount: 10, labelAnchors: [] },
      [{ id: "tg_fold", name: "fold", start: 3, end: 6, presentation: { collapsed: true } }],
    );
    const sourceBoundaryToContentX = (cycle: number) => {
      const display = cycle === 10 ? mapping.displayCycleCount : mapping.sourceToDisplay(cycle) ?? mapping.displayBoundaryAtOrAfterSource(cycle);
      return display * 10;
    };
    const overlays = projectSimulationTraceOverlays(trace(), projection(), { mapping, sourceBoundaryToContentX }, {
      ...viewport,
      displayEnd: mapping.displayCycleCount,
    }, 3);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]!.path.match(/M/g)).toHaveLength(2);
    expect(overlays[0]!.path).not.toContain("40");
    expect(overlays[0]!.path).toContain("M30");
  });

  it("omits traces for a different stable row or a replaced document epoch", () => {
    const mapping = buildDisplayTimeMapping({ cycleCount: 10, labelAnchors: [] }, []);
    const geometry = { mapping, sourceBoundaryToContentX: (cycle: number) => cycle * 10 };
    expect(projectSimulationTraceOverlays(trace(), projection("sig_other"), geometry, viewport, 3)).toEqual([]);
    expect(projectSimulationTraceOverlays(trace(2), projection(), geometry, viewport, 3)).toEqual([]);
  });
});
