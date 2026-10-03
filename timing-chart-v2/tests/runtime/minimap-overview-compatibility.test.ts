import { describe, expect, it } from "vitest";
import { canRetainSignalMiniMapOverview, planSignalMiniMapOverviewUpdate, type SignalMiniMapSource } from "../../apps/editor/src/runtime/minimap-overview-compatibility.js";

describe("Signal MiniMap overview continuity", () => {
  const groups = [];
  const signals = [];
  const cached: SignalMiniMapSource = { signalGroups: groups, signalCollection: signals, cycleCount: 100 };

  it("retains an exact-source overview", () => {
    expect(canRetainSignalMiniMapOverview(cached, cached, { fullDocumentReplace: true })).toBe(true);
  });

  it("keeps an identical waveform overview visible across a non-overview Signal property edit", () => {
    expect(canRetainSignalMiniMapOverview(cached, { ...cached, signalCollection: [] }, { rowPresentation: [] })).toBe(true);
  });

  it("reuses the cached overview without row traversal for an unrelated Annotation edit", () => {
    const current = { ...cached, signalCollection: [] };
    expect(planSignalMiniMapOverviewUpdate(cached, current, { annotationPosition: ["ann-1"] })).toEqual({ kind: "reuse" });
    expect(planSignalMiniMapOverviewUpdate(cached, current, { annotationStyle: ["ann-1"] })).toEqual({ kind: "reuse" });
  });

  it("updates only changed Signal IDs and rebuilds on topology or explicit overview invalidation", () => {
    const current = { ...cached, signalCollection: [] };
    expect(planSignalMiniMapOverviewUpdate(cached, current, { waveSemantics: ["sig-a"] })).toEqual({ kind: "incremental", changedSignalIds: ["sig-a"] });
    expect(planSignalMiniMapOverviewUpdate(cached, current, { rowOrder: ["sig-a"] })).toEqual({ kind: "rebuild" });
    expect(planSignalMiniMapOverviewUpdate(cached, current, { minimapOverview: true })).toEqual({ kind: "rebuild" });
  });

  it.each([
    ["waveform values", { waveSemantics: ["sig-a"] }],
    ["topology", { rowOrder: ["sig-a"] }],
    ["full document replacement", { fullDocumentReplace: true }],
    ["explicit overview invalidation", { minimapOverview: true }],
  ])("does not retain old waveform data for %s", (_label, change) => {
    expect(canRetainSignalMiniMapOverview(cached, { ...cached, signalCollection: [] }, change)).toBe(false);
  });

  it("invalidates on group or timeline identity changes", () => {
    expect(canRetainSignalMiniMapOverview(cached, { ...cached, signalGroups: [] }, undefined)).toBe(false);
    expect(canRetainSignalMiniMapOverview(cached, { ...cached, cycleCount: 101 }, undefined)).toBe(false);
  });
});
