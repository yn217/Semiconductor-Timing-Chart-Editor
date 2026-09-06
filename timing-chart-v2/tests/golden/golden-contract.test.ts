import { describe, expect, it } from "vitest";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { assertGoldenCoverageContract, assertGoldenSemanticContract, assertGoldenSvgContract, type GoldenContractMeta } from "./golden-contract.js";

const meta: GoldenContractMeta = { file: "negative.tcd.json", title: "Negative sample", cycles: 4, signalCount: 2, transactionCount: 1, coverage: ["waveform", "export"] };

const coverageMeta: GoldenContractMeta = {
  file: "coverage.tcd.json",
  title: "Coverage sample",
  coverage: ["clock", "annotation", "group band", "spacer row", "legend", "header", "footer", "transaction view", "transaction-to-signal highlight", "SVG export", "PNG export", "PDF export"],
};
const visualGate = {
  id: "v2-gui-visual-acceptance",
  source: "tests/e2e/gui-visual-acceptance.spec.ts",
  reference: "references/v2-gui-reference-v8/golden-home-cycle-1672x941.png",
} as const;

const coverageDocument = {
  formatVersion: 2,
  document: {
    id: "document",
    title: "Coverage sample",
    header: { subtitle: "subtitle", description: "description", notes: "notes", preconditions: [], constraints: [], exceptions: [] },
    footer: { figureNumber: "Figure 1", revision: "Rev A", text: "footer" },
  },
  timeline: { start: 0, end: 4, timeBase: "cycle", cycleCount: 4, edge: "rising", labelAnchors: [] },
  signals: [
    { id: "clk", name: "CLK", role: "input", type: "clock", source: { instancePath: [], signalName: "CLK" }, display: { name: "CLK" }, generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: 0 } } },
    { id: "data", name: "data", role: "output", type: "binary", source: { instancePath: [], signalName: "data" }, display: { name: "data" }, values: [{ start: 0, value: 0 }] },
  ],
  signalGroups: [{ id: "group", name: "Group", rows: ["clk", "data", "spacer"], spacers: [{ id: "spacer", height: 12 }], style: { showBackground: true, background: "#fff" } }],
  bookmarks: [],
  timeGroups: [],
  annotations: [{ id: "a", type: "text", label: "text", visible: true, anchor: { signalId: "clk", cycle: 0, point: "cycle-start", offset: { x: 0, y: 0 } } }],
  legend: { show: true, orientation: "horizontal", usedRolesOnly: true, position: { x: 10, y: 10 } },
  layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" },
  transactions: [{ id: "tx", name: "Transaction", start: 0, end: 2, linkedSignals: ["data"], links: { signals: ["data"] } }],
  constraints: [],
  checkSettings: {},
} as unknown as CanonicalDocument;

describe("Golden contract gate", () => {
  it("fails when a declared canonical feature is missing", () => {
    expect(() => assertGoldenSemanticContract(meta, { cycles: 4, signals: 1, transactions: 1 })).toThrow(/expected 2 signals/);
  });

  it("fails when the export scene or declared objects are missing", () => {
    expect(() => assertGoldenSvgContract(meta, `<svg data-export-scene="v2"><text>Negative sample</text></svg>`)).toThrow(/signal/);
    expect(() => assertGoldenSvgContract(meta, `<svg><text>Negative sample</text></svg>`)).toThrow(/scene marker/);
  });

  it("accepts a complete semantic/export contract", () => {
    assertGoldenSemanticContract(meta, { cycles: 4, signals: 2, transactions: 1 });
    assertGoldenSvgContract(meta, `<svg data-export-scene="v2"><text>Negative sample</text><g data-signal-id="a"/><g data-signal-id="b"/><g data-transaction-id="t"/></svg>`);
  });

  it("maps every declared feature to an observable check and fails on feature removal", () => {
    const evidence = assertGoldenCoverageContract(coverageMeta, coverageDocument, { rendered: true, visualGate, exportedFormats: ["svg", "png", "pdf"] });
    expect(evidence).toHaveLength(coverageMeta.coverage.length);
    expect(evidence.map((item) => item.check)).toContain("canonical-spacer-row");
    const withoutSpacer = { ...coverageDocument, signalGroups: [{ ...coverageDocument.signalGroups[0], spacers: [] }] } as CanonicalDocument;
    expect(() => assertGoldenCoverageContract(coverageMeta, withoutSpacer, { rendered: true, visualGate, exportedFormats: ["svg", "png", "pdf"] })).toThrow(/spacer row/);
  });

  it("fails when a declared export was not produced", () => {
    expect(() => assertGoldenCoverageContract(coverageMeta, coverageDocument, { rendered: true, visualGate, exportedFormats: ["svg"] })).toThrow(/export-png/);
  });

  it("fails instead of silently accepting an unknown coverage label", () => {
    const unknown = { ...coverageMeta, coverage: ["future feature"] };
    expect(() => assertGoldenCoverageContract(unknown, coverageDocument, { rendered: true, visualGate })).toThrow(/unsupported Golden coverage label/);
  });
});
