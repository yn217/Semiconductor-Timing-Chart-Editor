import type { CanonicalDocument, GroupId, SignalId } from "@timing-chart-v2/schema";

export function canonicalFixture(): CanonicalDocument {
  const clk = "sig_clk" as SignalId;
  const data = "sig_data" as SignalId;
  return {
    formatVersion: 2,
    document: {
      id: "fixture",
      title: "Phase 1 fixture",
      header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
      footer: { figureNumber: "1", revision: "A", text: "" },
    },
    timeline: { start: 0, end: 8, timeBase: "cycle", cycleCount: 8, referenceClock: clk, edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_main" as GroupId, name: "Main", rows: [clk, data] }],
    signals: [
      {
        id: clk, name: "CLK", type: "clock", role: "input",
        source: { instancePath: [], signalName: "CLK" }, display: { name: "CLK" },
        generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
        edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
      },
      {
        id: data, name: "DATA", type: "bus", role: "internal", width: 8, displayFormat: "hex",
        source: { instancePath: [], signalName: "DATA" }, display: { name: "DATA" },
        values: [{ start: 0, value: "00" }, { start: 4, value: "A5" }],
      },
    ],
    bookmarks: [], timeGroups: [], annotations: [],
    legend: { show: true, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" },
    transactions: [], constraints: [], checkSettings: {},
  };
}
