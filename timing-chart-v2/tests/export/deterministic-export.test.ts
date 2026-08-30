import { describe, expect, it } from "vitest";
import { buildExportScene, DeterministicExportService, renderExportSvg } from "@timing-chart-v2/export";
import type { AnnotationId, CanonicalDocument, CommentRow, GroupId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";
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

function foldedFixture(): CanonicalDocument {
  const base = canonicalFixture();
  const data = base.signals[1]!;
  const { referenceClock: _referenceClock, ...timeline } = base.timeline;
  return {
    ...base,
    timeline: { ...timeline, cycleCount: 20, labelAnchors: [{ id: "la_export" as never, source: 15, display: 1000 }] },
    signals: [base.signals[0]!, { ...data, values: [{ start: 0, value: "00" }, { start: 4, value: "A5" }, { start: 10, value: "FF" }, { start: 16, value: "00" }] }],
    timeGroups: [{ id: "tg_export" as TimeGroupId, name: "Idle", start: 5, end: 15, presentation: { collapsed: true } }],
    annotations: [{ id: "ann_export" as AnnotationId, type: "marker", label: "Mid-fold", anchor: { signalId: data.id, cycle: 10, point: "cycle-start" } }],
    transactions: [{ id: "txn_export" as TransactionId, name: "DMA", start: 2, end: 12, laneId: "lane_dma", linkedSignals: [data.id] }],
  };
}

describe("deterministic document export", () => {
  it("exports Comment Row body at the waveform origin without sending it to WaveDrom", () => {
    const base = canonicalFixture();
    const comment: CommentRow = { id: "comment_export" as SignalId, type: "commentRow", name: "Review note", role: "internal", source: { instancePath: [], signalName: "review_note" }, display: { name: "Review note" }, title: "Review note", body: "Starts at cycle zero" };
    const document = { ...base, signals: [...base.signals, comment], signalGroups: base.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, comment.id] } : group) };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const svg = renderExportSvg(scene);
    expect(scene.waveforms.some((wave) => wave.signalId === comment.id)).toBe(false);
    expect(scene.labels).toContainEqual({ text: comment.body, x: 220, y: expect.any(Number), kind: "comment" });
    expect(svg).toContain("Starts at cycle zero");
    expect(svg).toContain('data-label-kind="comment"');
  });

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
    expect(first).toContain('data-wave-engine="wavedrom-3.6.2"');
    expect(first).toContain('class="WaveDrom"');
    expect(first).not.toMatch(/Inspector|Ribbon|selection-handle|snap-guide/);
  });

  it("exports the canonical editable Legend position", () => {
    const document = { ...canonicalFixture(), legend: { ...canonicalFixture().legend, show: true, position: { x: 36, y: 48 } } };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    expect(scene.legendPosition).toEqual({ x: 36, y: 48 });
    expect(renderExportSvg(scene)).toContain('<g data-layer="legend" transform="translate(36 48)"');
  });

  it("exports Group Band presentation and derived per-object spacing", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      layout: { ...base.layout, signalSpacing: 6 },
      signalGroups: base.signalGroups.map((group, index) => index === 0
        ? { ...group, spacingBefore: 5, spacingAfter: 7, style: { showBackground: true, background: "#123456", opacity: 0.4, extend: "label" as const, border: "#ff0000", showHeader: true } }
        : group),
      signals: base.signals.map((signal, index) => index === 1 ? { ...signal, spacingBefore: 3, spacingAfter: 4 } : signal),
    };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const first = scene.waveforms.find((wave) => wave.signalId === document.signalGroups[0]!.rows[0]);
    const second = scene.waveforms.find((wave) => wave.signalId === document.signalGroups[0]!.rows[1]);
    expect(second!.y).toBeGreaterThan(first!.y! + base.layout.rowHeight);
    expect(scene.groupBands[0]).toMatchObject({ x: 0, width: 220, fill: "#123456", fillOpacity: 0.4, stroke: "#ff0000", scope: "label", showHeader: true });
    const svg = renderExportSvg(scene);
    expect(svg).toContain('data-layer="group-bands"');
    expect(svg).toContain('data-scope="label"');
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('stroke="#ff0000"');
  });

  it("omits the Group Band border when the canonical border is disabled", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      signalGroups: base.signalGroups.map((group, index) => index === 0
        ? { ...group, style: { showBackground: true, background: "#123456", opacity: 0.4, extend: "both" as const, showHeader: true } }
        : group),
    };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    expect(scene.groupBands[0]?.stroke).toBe("none");
    expect(renderExportSvg(scene)).toContain('stroke="none"');
  });

  it("supports selected-range SVG and deterministic PDF bytes", async () => {
    const document = scaleFixture(3);
    const service = new DeterministicExportService();
    const snapshot = { revision: 7, document };
    const svg = new TextDecoder().decode(await service.export({ format: "svg", snapshot, settings: { scope: "selected-range", range: { start: 2, end: 5 } } }));
    expect(svg).toContain('data-wave-engine="wavedrom-3.6.2"');
    const first = await service.export({ format: "pdf", snapshot });
    const second = await service.export({ format: "pdf", snapshot });
    expect(new TextDecoder().decode(first.slice(0, 8))).toBe("%PDF-1.4");
    expect(first).toEqual(second);
  });

  it("applies page size, orientation, margin and fit through the shared ExportScene", () => {
    const document = scaleFixture(2);
    const page = { size: "A4" as const, orientation: "portrait" as const, margin: 32, fit: "page" as const };
    const scene = buildExportScene(document, { format: "svg", scope: "document", page });
    expect(scene.width).toBe(794);
    expect(scene.height).toBe(1123);
    expect(scene.page).toMatchObject({ margin: 32, fit: "page" });
    expect(scene.page!.contentScale).toBeGreaterThan(0);
    const svg = renderExportSvg(scene);
    expect(svg).toContain('data-layer="page-content"');
    expect(svg).toContain('viewBox="0 0 794 1123"');
    expect(svg).toContain(`translate(${scene.page!.contentOffsetX} ${scene.page!.contentOffsetY}) scale(${scene.page!.contentScale})`);
  });

  it("exports document header/footer through an independent wrapped layout", () => {
    const document = { ...scaleFixture(2), document: {
      ...scaleFixture(2).document,
      title: "Timing Review",
      header: { subtitle: "Reviewed timing", description: "A description that remains in document layout even when the waveform width changes.", notes: "Notes", preconditions: ["Clock is stable"], constraints: ["Setup must hold"], exceptions: ["Reset window"] },
      footer: { figureNumber: "Fig. 2", revision: "R3", text: "Internal review" },
    } };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const svg = renderExportSvg(scene);
    expect(scene.documentLayout.title).toBe("Timing Review");
    expect(svg).toContain('data-layer="document-layout"');
    expect(svg).toContain('data-layout="header"');
    expect(svg).toContain("Precondition: Clock is stable");
    expect(svg).toContain('data-layout="footer"');
    expect(svg).toContain("Fig. 2 · R3 · Internal review");
    expect(scene.height).toBeGreaterThan(buildExportScene(scaleFixture(2), { format: "svg", scope: "document" }).height);
  });

  it("exports Timing Region and linked Ghost Trace as derived overlay layers", () => {
    const base = canonicalFixture();
    const source = base.signals[1]!;
    const document = { ...base, annotations: [
      { id: "ann_region" as AnnotationId, type: "timingRegion" as const, label: "Setup", visible: true, opacity: 0.2, start: { signalId: source.id, cycle: 1, point: "cycle-start" as const }, end: { signalId: source.id, cycle: 4, point: "cycle-end" as const } },
      { id: "ann_ghost" as AnnotationId, type: "ghostTrace" as const, label: "Previous", visible: true, sourceSignalId: source.id, traceOffsetCycles: -1, opacity: 0.5, start: { signalId: source.id, cycle: 2, point: "cycle-start" as const }, end: { signalId: source.id, cycle: 5, point: "cycle-end" as const } },
    ] };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const svg = renderExportSvg(scene);
    expect(svg).toContain('data-annotation-type="timingRegion"');
    expect(svg).toContain('data-annotation-type="ghostTrace"');
    expect(scene.annotations.find((item) => item.id === "ann_ghost")?.tracePoints?.length).toBeGreaterThan(1);
    expect(svg).toContain('data-role="ghost-trace-path"');
    expect(svg).toContain('data-source-signal-id="sig_data"');
    expect(svg).toContain('data-trace-offset-cycles="-1"');
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it("exports clock edge counters from the same scene cycle mapping", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document = {
      ...base,
      signals: [{ ...clock, edgeCounter: { ...clock.edgeCounter, show: true, mode: "both" as const, startNumber: 10, labelEvery: 1 } }, base.signals[1]!],
    };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const svg = renderExportSvg(scene);
    expect(scene.edgeCounters.length).toBeGreaterThan(4);
    expect(scene.edgeCounters[0]?.label).toBe("10");
    expect(scene.edgeCounters[1]?.label).toBe("11");
    expect(svg).toContain('data-layer="edge-counters"');
    expect(svg).toContain('data-edge-counter-id="edge:sig_clk:rising:0"');
    expect(svg).toContain('data-edge-kind="falling"');
    expect(scene.edgeCounters.every((edge) => edge.x >= scene.ruler.x && edge.x <= scene.width)).toBe(true);
    const visibleRange = buildExportScene({ ...document, signals: [{ ...document.signals[0]!, edgeCounter: { ...document.signals[0]!.edgeCounter, countFrom: "visible-range-start" as const } }, document.signals[1]!] }, { format: "svg", scope: "selected-range", range: { start: 4, end: 7 } });
    expect(visibleRange.edgeCounters[0]?.cycle).toBeGreaterThanOrEqual(4);
    expect(visibleRange.edgeCounters[0]?.label).toBe("10");
  });

  it("compresses a collapsed TimeGroup into a shorter deterministic export when respecting folds", () => {
    const document = foldedFixture();
    const respected = buildExportScene(document, { format: "svg", scope: "document", foldPolicy: "respect" });
    const expanded = buildExportScene(document, { format: "svg", scope: "document", foldPolicy: "expand" });
    expect(respected.ruler.end - respected.ruler.start).toBe(10); // 20 source cycles - 10 hidden by the [5,15) fold
    expect(expanded.ruler.end - expanded.ruler.start).toBe(20);
    expect(respected.width).toBeLessThan(expanded.width);
    expect(respected.axisBreaks).toEqual([{ id: "tg_export", name: "Idle", sourceStart: 5, sourceEnd: 15, x: expect.any(Number) }]);
    expect(expanded.axisBreaks).toHaveLength(0);
    // Canonical source data must stay unchanged by either export.
    expect(document.timeline.cycleCount).toBe(20);
    expect(document.signals[1]!.values).toHaveLength(4);
  });

  it("reflects a labelAnchor override in the exported ruler text instead of raw source cycle numbers", () => {
    const scene = buildExportScene(foldedFixture(), { format: "svg", scope: "document", foldPolicy: "respect" });
    const resumeTick = scene.ruler.ticks.find((tick) => tick.cycle === 5);
    expect(resumeTick?.text).toBe("1000");
    const svg = renderExportSvg(scene);
    expect(svg).toContain(">1000<");
    expect(svg).toContain('data-layer="axis-breaks"');
    expect(svg).toContain('data-axis-break-id="tg_export"');
  });

  it("shares the same folded time mapping across waveforms, transactions, and annotations", () => {
    const scene = buildExportScene(foldedFixture(), { format: "svg", scope: "document", foldPolicy: "respect" });
    // The DMA transaction (source 2..12) ends inside the collapsed [5,15) range and must clamp to
    // the display-5 fold-resume boundary rather than extending past the compressed export width.
    const transaction = scene.transactions.find((item) => item.id === "txn_export");
    // The mid-fold annotation (source cycle 10, hidden inside the fold) must clamp to the last
    // visible display cycle (4) rather than being placed at its raw, no-longer-meaningful source position.
    const annotation = scene.annotations.find((item) => item.id === "ann_export");
    expect(transaction).toBeDefined();
    expect(annotation).toBeDefined();
    const foldBoundaryX = scene.ruler.x + (5 - scene.ruler.start) * scene.ruler.cycleWidth;
    const lastVisibleX = scene.ruler.x + (4 - scene.ruler.start) * scene.ruler.cycleWidth;
    expect(transaction!.x + transaction!.width).toBeCloseTo(foldBoundaryX, 5);
    expect(annotation!.x1).toBeCloseTo(lastVisibleX, 5);
    expect(annotation!.x1).toBeLessThan(foldBoundaryX);
  });
});
