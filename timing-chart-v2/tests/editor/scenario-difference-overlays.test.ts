import { describe, expect, it, vi } from "vitest";
import type { DisplayTimeViewport, RenderProjection } from "@timing-chart-v2/projection";
import type { ScenarioSignalDifference, SignalId } from "@timing-chart-v2/schema";
import { projectScenarioDifferenceOverlays } from "../../apps/editor/src/runtime/scenario-difference-overlays.js";

function projection(rows: readonly Readonly<{ rowId: string; kind: "timing" | "comment"; visible: boolean; y: number; height: number }>[]): RenderProjection {
  return { rowLayout: rows.map((row) => ({ ...row, groupId: "grp_main", groupName: "Main", name: row.rowId })), totalHeight: 1000 } as unknown as RenderProjection;
}

const viewport: DisplayTimeViewport = {
  sourceStart: 5,
  sourceEnd: 15,
  displayStart: 5,
  displayEnd: 15,
  overscanCycles: 0,
  rowStart: 100,
  rowEnd: 160,
  generation: 1,
  pinnedIds: [],
};

describe("Scenario difference overlay projection", () => {
  it("projects visible stable-Signal ranges through shared source-boundary geometry and clips to viewport", () => {
    const signalId = "sig_data" as SignalId;
    const hiddenSignalId = "sig_hidden" as SignalId;
    const differences: readonly ScenarioSignalDifference[] = [
      { signalId, ranges: [{ start: 2, end: 8 }, { start: 13, end: 18 }] },
      { signalId: hiddenSignalId, ranges: [{ start: 6, end: 9 }] },
    ];
    const sourceBoundaryToContentX = vi.fn((cycle: number) => cycle * 10);

    const overlays = projectScenarioDifferenceOverlays(
      differences,
      projection([
        { rowId: signalId, kind: "timing", visible: true, y: 120, height: 28 },
        { rowId: hiddenSignalId, kind: "timing", visible: false, y: 140, height: 28 },
        { rowId: "comment", kind: "comment", visible: true, y: 160, height: 28 },
      ]),
      { sourceBoundaryToContentX },
      viewport,
    );

    expect(overlays).toEqual([
      { key: "sig_data:5:8", signalId, sourceStart: 5, sourceEnd: 8, x: 50, y: 120, width: 30, height: 28 },
      { key: "sig_data:13:15", signalId, sourceStart: 13, sourceEnd: 15, x: 130, y: 120, width: 20, height: 28 },
    ]);
    expect(sourceBoundaryToContentX.mock.calls).toEqual([[5], [8], [13], [15]]);
  });

  it("does not emit collapsed ranges with no visible shared-axis width", () => {
    const signalId = "sig_folded" as SignalId;
    const differences: readonly ScenarioSignalDifference[] = [{ signalId, ranges: [{ start: 6, end: 10 }] }];
    const overlays = projectScenarioDifferenceOverlays(
      differences,
      projection([{ rowId: signalId, kind: "timing", visible: true, y: 120, height: 28 }]),
      { sourceBoundaryToContentX: (cycle) => cycle <= 6 ? cycle * 10 : cycle < 10 ? 60 : (cycle - 4) * 10 },
      { ...viewport, sourceStart: 0, sourceEnd: 20 },
    );

    expect(overlays).toEqual([]);
  });
});
