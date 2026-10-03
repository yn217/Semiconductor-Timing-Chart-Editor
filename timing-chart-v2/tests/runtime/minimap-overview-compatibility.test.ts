import { describe, expect, it } from "vitest";
import { canRetainSignalMiniMapOverview, type SignalMiniMapSource } from "../../apps/editor/src/runtime/minimap-overview-compatibility.js";

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
