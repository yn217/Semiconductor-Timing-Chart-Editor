import { describe, expect, it } from "vitest";
import { buildExportScene, DeterministicExportService, renderExportSvg } from "@timing-chart-v2/export";
import type { AnnotationId, CanonicalDocument, GroupId, SignalId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

function scaleFixture(signalCount: number): CanonicalDocument {
  const base = canonicalFixture();
  const prototype = base.signals[1]!;
  const signals = Array.from({ length: signalCount }, (_, index) => ({ ...prototype, id: `sig_perf_${index}` as SignalId, name: `DATA_${index}`, display: { ...prototype.display, name: `DATA_${index}` }, source: { ...prototype.source, signalName: `DATA_${index}` } }));
  const { referenceClock: _referenceClock, ...timeline } = base.timeline;
  return {
    ...base,
    timeline,
    signals,
    signalGroups: [{ id: "grp_perf" as GroupId, name: "All Signals", rows: signals.map((signal) => signal.id) }],
    annotations: [{ id: "ann_export" as AnnotationId, type: "range", label: "Window", start: { signalId: signals[0]!.id, cycle: 1, point: "cycle-start" }, end: { signalId: signals[1]!.id, cycle: 4, point: "cycle-start" } }],
    transactions: [{ id: "txn_export" as TransactionId, name: "DMA", start: 2, end: 6, laneId: "lane_dma", linkedSignals: [signals[0]!.id] }],
  };
}

describe("deterministic document export", () => {
  it("exports every virtualized-offscreen Signal and excludes editor chrome", () => {
    const scene = buildExportScene(scaleFixture(100), { format: "svg", scope: "document" });
    const first = renderExportSvg(scene);
    const second = renderExportSvg(buildExportScene(scaleFixture(100), { format: "svg", scope: "document" }));
    expect(scene.waveforms).toHaveLength(100);
    expect(scene.transactions).toHaveLength(1);
    expect(scene.annotations).toHaveLength(1);
    expect(first).toBe(second);
    expect(first.match(/data-signal-id=/g)).toHaveLength(100);
    expect(first).toContain('data-transaction-id="txn_export"');
    expect(first).toContain('data-annotation-id="ann_export"');
    expect(first).toContain('data-group-id="grp_perf"');
    expect(first).toContain('data-layer="legend"');
    expect(first).not.toMatch(/Inspector|Ribbon|selection-handle|snap-guide/);
  });

  it("supports selected-range SVG and deterministic PDF bytes", async () => {
    const document = scaleFixture(3);
    const service = new DeterministicExportService();
    const snapshot = { revision: 7, document };
    const svg = new TextDecoder().decode(await service.export({ format: "svg", snapshot, settings: { scope: "selected-range", range: { start: 2, end: 5 } } }));
    expect(svg).toContain('viewBox="0 0 364');
    const first = await service.export({ format: "pdf", snapshot });
    const second = await service.export({ format: "pdf", snapshot });
    expect(new TextDecoder().decode(first.slice(0, 8))).toBe("%PDF-1.4");
    expect(first).toEqual(second);
  });
});
