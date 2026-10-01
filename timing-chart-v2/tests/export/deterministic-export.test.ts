import { describe, expect, it, vi } from "vitest";
import { buildExportScene, DeterministicExportService, renderExportSvg } from "@timing-chart-v2/export";
import { MAX_MEASUREMENT_LANE, type AnnotationId, type BookmarkId, type CanonicalDocument, type ClockSignal, type CommentRow, type GroupId, type SignalId, type TimeGroupId, type TransactionId } from "@timing-chart-v2/schema";
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

// #200 combined two-pane export: a "both"-assigned Signal must render
// TWICE (once per pane), while an Upper-only/Lower-only Signal renders
// once, in its own pane's stacked block.
function splitFixture(): CanonicalDocument {
  const base = canonicalFixture();
  const prototype = base.signals[1]!;
  const upper = { ...prototype, id: "sig_split_upper" as SignalId, name: "UP", display: { name: "UP", splitPane: "upper" as const } };
  const shared = { ...prototype, id: "sig_split_shared" as SignalId, name: "SHARED", display: { name: "SHARED" } };
  const lower = { ...prototype, id: "sig_split_lower" as SignalId, name: "LOW", display: { name: "LOW", splitPane: "lower" as const } };
  return {
    ...base,
    signalGroups: [{ id: "grp_split" as GroupId, name: "Split", rows: [upper.id, shared.id, lower.id] }],
    signals: [base.signals[0]!, upper, shared, lower],
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

  it("keeps navigation Bookmarks out of default specification export", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      bookmarks: [{ id: "bookmark_navigation_only" as BookmarkId, name: "Navigation-only bookmark", start: 3, comment: "editor index" }],
    };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const svg = renderExportSvg(scene);

    // Bookmarks are persisted editor navigation metadata. An exported
    // specification must not turn them into Annotation Marker-like flags.
    expect(svg).not.toContain("bookmark_navigation_only");
    expect(svg).not.toContain("Navigation-only bookmark");
    expect(svg).not.toContain('data-layer="bookmarks"');
    expect(svg).not.toContain('data-bookmark-id=');
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

  it("uses the same bounded value-label policy in SVG export and keeps semantic values in title metadata", () => {
    const base = canonicalFixture();
    const data = base.signals[1]!;
    const document = {
      ...base,
      signals: [{ ...base.signals[0]! }, { ...data, values: [{ start: 0, value: "0xDEADBEEF" }, { start: 1, value: "LONG_SYMBOLIC_STATE" }, { start: 2, value: "NEXT" }] }],
    };
    const svg = renderExportSvg(buildExportScene(document, { format: "svg", scope: "document" }));
    expect(svg).toContain('data-value-label-mode="ellipsis"');
    expect(svg).toContain('aria-label="0xDEADBEEF"');
    expect(svg).toContain("<title>0xDEADBEEF</title>");
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
  });

  it("exports authored Annotation line spacing using the same font-size multiplier as the live overlay", () => {
    const base = canonicalFixture();
    const annotation = { id: "ann_line_spacing" as AnnotationId, type: "callout" as const, label: "first\nsecond", visible: true, anchor: { cycle: 2, point: "cycle-center" as const }, style: { fontSize: 12, lineHeight: 1.8 } };
    const svg = renderExportSvg(buildExportScene({ ...base, annotations: [annotation] }, { format: "svg", scope: "document" }));
    expect(svg).toContain('<tspan x="');
    expect(svg).toContain('dy="21.6">second</tspan>');
  });

  it("exports authored Annotation label placement at the selected semantic endpoint", () => {
    const base = canonicalFixture();
    const signalId = base.signals[1]!.id;
    const annotation = { id: "ann_label_end" as AnnotationId, type: "range" as const, label: "End", visible: true, start: { signalId, cycle: 2, point: "cycle-start" as const }, end: { signalId, cycle: 7, point: "cycle-start" as const }, labelOffset: { x: 0, y: 0 }, labelPlacement: "end" as const };
    const scene = buildExportScene({ ...base, annotations: [annotation] }, { format: "svg", scope: "document" });
    const projected = scene.annotations.find((item) => item.id === annotation.id)!;
    expect(renderExportSvg(scene)).toContain(`<text x="${projected.x2}" y="${projected.y2}"`);
  });

  it("exports the canonical editable Legend position", () => {
    const document = { ...canonicalFixture(), legend: { ...canonicalFixture().legend, show: true, position: { x: 36, y: 48 } } };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    expect(scene.legendPosition).toEqual({ x: 36, y: 48 });
    const svg = renderExportSvg(scene);
    expect(svg).toContain('<g data-layer="legend" data-orientation="horizontal" transform="translate(36 48)"');
    expect(svg).toContain('<text x="12" y="12">');
    expect(svg).not.toContain(`<text x="12" y="${scene.height - 12}">`);
  });

  it("preserves vertical Legend orientation in SVG export", () => {
    const base = canonicalFixture();
    const labels = ["Input", "Output"];
    const document = { ...base, legend: { ...base.legend, show: true, orientation: "vertical" as const, usedRolesOnly: false, items: labels.map((label, order) => ({ id: `legend-${order}`, role: order === 0 ? "input" as const : "output" as const, label, visible: true, order })) } };
    const svg = renderExportSvg(buildExportScene(document, { format: "svg", scope: "document" }));
    expect(svg).toContain('<g data-layer="legend" data-orientation="vertical"');
    expect(svg).toContain('<text x="12" y="12">Input</text>');
    expect(svg).toContain('<text x="12" y="26">Output</text>');
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

  it("includes leading and trailing Spacer rows in Group Band export bounds", () => {
    const base = canonicalFixture();
    const styled = { showBackground: true, background: "#123456", opacity: 0.4, extend: "both" as const, showHeader: true };
    const withoutSpacers = buildExportScene({ ...base, signalGroups: [{ ...base.signalGroups[0]!, style: styled }] }, { format: "svg", scope: "document" });
    const withSpacers = buildExportScene({
      ...base,
      signalGroups: [{ ...base.signalGroups[0]!, rows: ["spacer_lead", ...base.signalGroups[0]!.rows, "spacer_tail"], spacers: [{ id: "spacer_lead", height: 16 }, { id: "spacer_tail", height: 20 }], style: styled }],
    }, { format: "svg", scope: "document" });
    expect(withSpacers.groupBands[0]!.height).toBeGreaterThan(withoutSpacers.groupBands[0]!.height);
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

  it("yields between WaveDrom rows during browser export without changing deterministic SVG", async () => {
    const document = scaleFixture(2);
    const settings = { scope: "document" as const };
    const expected = renderExportSvg(buildExportScene(document, { format: "svg", ...settings }));
    const service = new DeterministicExportService();
    const yieldTask = vi.fn(async () => undefined);
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
    vi.stubGlobal("scheduler", { yield: yieldTask });
    try {
      const actual = new TextDecoder().decode(await service.export({ format: "svg", snapshot: { revision: 0, document }, settings }));
      expect(yieldTask).toHaveBeenCalled();
      expect(actual).toBe(expected);
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("yields while building and serializing a dense ruler even when no WaveDrom rows exist", async () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 96, cycleCount: 96 },
      signals: [],
      signalGroups: [],
      transactions: [],
      annotations: [],
      timeGroups: [],
    };
    const settings = { scope: "document" as const };
    const expected = renderExportSvg(buildExportScene(document, { format: "svg", ...settings }));
    const service = new DeterministicExportService();
    const yieldTask = vi.fn(async () => undefined);
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
    vi.stubGlobal("scheduler", { yield: yieldTask });
    try {
      const actual = new TextDecoder().decode(await service.export({ format: "svg", snapshot: { revision: 0, document }, settings }));
      expect(yieldTask.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(actual).toBe(expected);
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("renders selected-range WaveDrom inputs as bounded windows without changing source cycles", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 100, cycleCount: 100 },
      signals: [base.signals[0]!, { ...base.signals[1]!, values: [{ start: 0, value: "00" }, { start: 22, value: "A5" }, { start: 50, value: "FF" }] }],
    };
    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 20, end: 25 } });

    expect(scene.waveforms).toHaveLength(2);
    for (const waveform of scene.waveforms) {
      expect(JSON.parse(waveform.waveJson).wave).toHaveLength(5);
      expect(waveform.cropX).toBe(0);
      expect(waveform.width).toBeGreaterThan(0);
      expect(waveform.sourceWidth).toBeLessThan(100 * 20);
    }
    expect(JSON.parse(scene.waveforms.find((wave) => wave.signalId === document.signals[1]!.id)!.waveJson).data).toEqual(["0x00", "0xA5"]);

    const wholeDocument = buildExportScene(document, { format: "svg", scope: "document" });
    expect(JSON.parse(wholeDocument.waveforms[0]!.waveJson).wave).toHaveLength(100);
    expect(JSON.parse(wholeDocument.waveforms[1]!.waveJson).wave).toHaveLength(100);
  });

  it("keeps selected-range clock export bounded when the range ends in a partial final period", () => {
    const base = canonicalFixture();
    const sourceClock = base.signals[0] as ClockSignal;
    const clock: ClockSignal = { ...sourceClock, generator: { ...sourceClock.generator, period: 6 } };
    const document = { ...base, timeline: { ...base.timeline, end: 100, cycleCount: 100 }, signals: [clock, base.signals[1]!] };
    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 97, end: 100 } });
    const waveform = scene.waveforms.find((item) => item.signalId === clock.id)!;
    const waveJson = JSON.parse(waveform.waveJson);

    expect(waveJson.wave).toHaveLength(1);
    expect(waveJson.sourceWindow).toEqual({ start: 96, end: 100 });
    expect(waveJson.displayWindow).toEqual({ start: 96, end: 100 });
    expect(waveform.cropX).toBeGreaterThan(0);
    expect(waveform.width).toBeLessThan(waveform.sourceWidth);
    expect(waveform.sourceWidth).toBeLessThan(100 * 20);
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
    const base = scaleFixture(2);
    const document = { ...base, document: {
      ...base.document,
      title: "Timing Review",
      header: { subtitle: "Reviewed timing", description: "A description that remains in document layout even when the waveform width changes.", notes: "Notes", preconditions: ["Clock is stable"], constraints: ["Setup must hold"], exceptions: ["Reset window"] },
      footer: { figureNumber: "Fig. 2", revision: "R3", text: "Internal review" },
    } };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const widerWaveform = buildExportScene({ ...document, timeline: { ...document.timeline, cycleCount: 100 } }, { format: "svg", scope: "document" });
    const svg = renderExportSvg(scene);
    expect(scene.documentLayout.title).toBe("Timing Review");
    expect(svg).toContain('data-layer="document-layout"');
    expect(svg).toContain('data-layout="header"');
    expect(svg).toContain("Precondition: Clock is stable");
    expect(svg).toContain('data-layout="footer"');
    expect(svg).toContain("Fig. 2 · R3 · Internal review");
    expect(scene.height).toBeGreaterThan(buildExportScene(scaleFixture(2), { format: "svg", scope: "document" }).height);
    expect(widerWaveform.width).toBeGreaterThan(scene.width);
    expect(widerWaveform.documentLayout).toEqual(scene.documentLayout);
    expect(widerWaveform.waveforms[0]?.y).toBe(scene.waveforms[0]?.y);
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

  it("bounds selected-range Ghost Trace source waveform to the selected and sampled intervals", () => {
    const base = canonicalFixture();
    const source = base.signals[1]!;
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 100, cycleCount: 100 },
      signals: [base.signals[0]!, { ...source, values: [{ start: 0, value: "00" }, { start: 50, value: "A5" }] }],
      annotations: [{ id: "ann_long_ghost" as AnnotationId, type: "ghostTrace" as const, label: "Window", visible: true, sourceSignalId: source.id, traceOffsetCycles: -1, start: { signalId: source.id, cycle: 0, point: "cycle-start" as const }, end: { signalId: source.id, cycle: 100, point: "cycle-end" as const } }],
    };
    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 40, end: 45 } });
    const ghost = scene.annotations.find((annotation) => annotation.id === "ann_long_ghost");
    const fullGhost = buildExportScene(document, { format: "svg", scope: "document" }).annotations.find((annotation) => annotation.id === "ann_long_ghost");

    expect(ghost?.tracePoints).toHaveLength(6);
    expect(ghost?.tracePoints?.map((point) => point.y)).toEqual(fullGhost?.tracePoints?.slice(40, 46).map((point) => point.y));
    const ghostSource = scene.waveforms.find((wave) => wave.signalId === source.id)!;
    expect(JSON.parse(ghostSource.waveJson).wave).toHaveLength(6);
    expect(ghostSource.cropX).toBe(0);
    expect(JSON.parse(scene.waveforms.find((wave) => wave.signalId === base.signals[0]!.id)!.waveJson).wave).toHaveLength(5);
  });

  it("samples folded Ghost Trace values by display cycle after the fold", () => {
    const base = canonicalFixture();
    const source = { ...base.signals[1]!, type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 6, value: 1 }, { start: 7, value: 0 }] };
    const document = {
      ...base,
      timeline: { ...base.timeline, cycleCount: 8, end: 8 },
      signals: [base.signals[0]!, source],
      timeGroups: [{ id: "tg_export" as TimeGroupId, name: "Idle", start: 2, end: 5, presentation: { collapsed: true } }],
      annotations: [{ id: "ann_folded_ghost" as AnnotationId, type: "ghostTrace" as const, label: "Folded", visible: true, sourceSignalId: source.id, start: { signalId: source.id, cycle: 5, point: "cycle-start" as const }, end: { signalId: source.id, cycle: 7, point: "cycle-end" as const } }],
    };

    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 5, end: 8 } });
    const ghost = scene.annotations.find((annotation) => annotation.id === "ann_folded_ghost")!;
    const traceWave = scene.waveforms.find((wave) => wave.signalId === source.id)!;
    const wave = JSON.parse(traceWave.waveJson).wave as string;
    const trace = ghost.tracePoints!;
    expect(wave).toHaveLength(5);
    expect(trace).toHaveLength(3);
    expect(trace.map((point) => point.y)).toEqual([
      traceWave.y - traceWave.sourceHeight / 2 + 20,
      traceWave.y - traceWave.sourceHeight / 2,
      traceWave.y - traceWave.sourceHeight / 2 + 20,
    ]);
  });

  it("yields while sampling a long folded Ghost Trace without changing SVG bytes", async () => {
    const base = canonicalFixture();
    const source = base.signals[1]!;
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 1024, cycleCount: 1024 },
      timeGroups: [{ id: "tg_long_export" as TimeGroupId, name: "Collapsed", start: 2, end: 1000, presentation: { collapsed: true } }],
      annotations: [{ id: "ann_long_folded_ghost" as AnnotationId, type: "ghostTrace" as const, label: "Long", visible: true, sourceSignalId: source.id, start: { signalId: source.id, cycle: 0, point: "cycle-start" as const }, end: { signalId: source.id, cycle: 1024, point: "cycle-end" as const } }],
    };
    const settings = { scope: "selected-range" as const, range: { start: 0, end: 5 } };
    const expected = renderExportSvg(buildExportScene(document, { format: "svg", ...settings }));
    const service = new DeterministicExportService();
    const yieldTask = vi.fn(async () => undefined);
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
    vi.stubGlobal("scheduler", { yield: yieldTask });
    try {
      const actual = new TextDecoder().decode(await service.export({ format: "svg", snapshot: { revision: 0, document }, settings }));
      expect(yieldTask.mock.calls.length).toBeGreaterThan(10);
      expect(actual).toBe(expected);
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("yields during dense Transaction scene projection without changing SVG bytes", async () => {
    const base = canonicalFixture();
    const prototype = base.transactions[0]!;
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 1, cycleCount: 1 },
      signals: [],
      signalGroups: [],
      annotations: [],
      transactions: Array.from({ length: 96 }, (_, index) => ({ ...prototype, id: `txn_dense_${index}` as TransactionId, name: `Dense ${index}`, start: 0, end: 1, phases: [] })),
      timeGroups: [],
    };
    const settings = { scope: "document" as const };
    const expected = renderExportSvg(buildExportScene(document, { format: "svg", ...settings }));
    const service = new DeterministicExportService();
    const yieldTask = vi.fn(async () => undefined);
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
    vi.stubGlobal("scheduler", { yield: yieldTask });
    try {
      const actual = new TextDecoder().decode(await service.export({ format: "svg", snapshot: { revision: 0, document }, settings }));
      expect(yieldTask.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(actual).toBe(expected);
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("exports datasheet Measurement dimension markers, extensions, and lane metadata deterministically", () => {
    const base = canonicalFixture();
    const signal = base.signals[1]!;
    const document = { ...base, annotations: [{ id: "ann_dimension" as AnnotationId, type: "measurement" as const, label: "tPLH", visible: true, measurement: { profile: "custom" as const, anchorKind: "threshold" as const }, measurementLayout: { startMarker: "arrow" as const, endMarker: "bar" as const, arrowLayout: "outward" as const, extensionLines: "both" as const, lane: 2 }, start: { signalId: signal.id, cycle: 3, point: "transition-center" as const, transition: { kind: "threshold" as const, value: 0.17 } }, end: { signalId: signal.id, cycle: 7, point: "transition-center" as const, transition: { kind: "threshold" as const, value: 0.83 } } }] };
    const first = renderExportSvg(buildExportScene(document, { format: "svg", scope: "document" }));
    const second = renderExportSvg(buildExportScene(document, { format: "svg", scope: "document" }));
    expect(first).toBe(second);
    expect(first).toContain('data-annotation-type="measurement"');
    expect(first).toContain('data-role="measurement-dimension-line"');
    expect(first).toContain('data-role="measurement-marker" data-marker-side="start" data-marker-kind="arrow"');
    expect(first).toContain('data-role="measurement-extension" data-extension-side="start"');
    expect(first).toContain('data-measurement-profile="custom"');
  });

  it("keeps maximum authored Measurement lane coordinates finite and rejects hostile values", () => {
    const base = canonicalFixture();
    const signal = base.signals[1]!;
    const measurement = { id: "ann_max_lane" as AnnotationId, type: "measurement" as const, label: "maximum lane", visible: true, measurement: { profile: "cycle" as const, anchorKind: "threshold" as const }, measurementLayout: { startMarker: "bar" as const, endMarker: "bar" as const, arrowLayout: "auto" as const, extensionLines: "both" as const, lane: MAX_MEASUREMENT_LANE }, start: { signalId: signal.id, cycle: 1, point: "cycle-start" as const }, end: { signalId: signal.id, cycle: 3, point: "cycle-end" as const } };
    const scene = buildExportScene({ ...base, annotations: [measurement] }, { format: "svg", scope: "document" });
    expect(scene.annotations[0]?.measurementLane).toBe(MAX_MEASUREMENT_LANE);
    expect(renderExportSvg(scene)).toContain(`data-measurement-lane="${MAX_MEASUREMENT_LANE}"`);
    const hostile = { ...measurement, measurementLayout: { ...measurement.measurementLayout, lane: MAX_MEASUREMENT_LANE + 1 } };
    expect(() => buildExportScene({ ...base, annotations: [hostile] }, { format: "svg", scope: "document" })).toThrow(RangeError);
  });

  it("uses the same non-overlapping automatic Measurement lanes as the live overlay", () => {
    const base = canonicalFixture();
    const signal = base.signals[1]!;
    const measurement = (id: string) => ({
      id: id as AnnotationId,
      type: "measurement" as const,
      label: id,
      visible: true,
      measurement: { profile: "cycle" as const, anchorKind: "threshold" as const },
      measurementLayout: { startMarker: "bar" as const, endMarker: "bar" as const, arrowLayout: "auto" as const, extensionLines: "both" as const },
      start: { signalId: signal.id, cycle: 2, point: "cycle-start" as const },
      end: { signalId: signal.id, cycle: 6, point: "cycle-end" as const },
    });
    const document = { ...base, annotations: [measurement("ann_0"), measurement("ann_1"), measurement("ann_2")] };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    expect(scene.annotations.map((annotation) => annotation.measurementLane)).toEqual([0, 1, 2]);
    expect(renderExportSvg(scene)).toContain('data-measurement-lane="2"');
  });

  it("preserves cross-Signal Measurement endpoints and deterministic dimension export", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const data = base.signals[1]!;
    const measurement = {
      id: "ann_cross_signal" as AnnotationId,
      type: "measurement" as const,
      label: "t_cross",
      visible: true,
      measurement: { profile: "custom" as const, anchorKind: "ratio" as const },
      measurementLayout: { startMarker: "arrow" as const, endMarker: "arrow" as const, arrowLayout: "auto" as const, extensionLines: "both" as const },
      start: { signalId: clock.id, cycle: 2, point: "transition-center" as const, transition: { kind: "ratio" as const, value: 0.25 } },
      end: { signalId: data.id, cycle: 5, point: "transition-center" as const, transition: { kind: "ratio" as const, value: 0.75 } },
    };
    const document = { ...base, annotations: [measurement] };
    const first = buildExportScene(document, { format: "svg", scope: "document" });
    const second = buildExportScene(document, { format: "svg", scope: "document" });
    expect(first.annotations[0]).toMatchObject({ id: "ann_cross_signal", measurementProfile: "custom", transitionKind1: "ratio", transitionKind2: "ratio" });
    expect(first.annotations[0]?.x1).not.toBe(first.annotations[0]?.x2);
    expect(renderExportSvg(first)).toBe(renderExportSvg(second));
    expect(renderExportSvg(first)).toContain('data-start-transition-kind="ratio"');
    expect(renderExportSvg(first)).toContain('data-end-transition-kind="ratio"');
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

  it("bounds simple selected-range edge counters without renumbering global labels", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 100, cycleCount: 100 },
      signals: [{ ...clock, generator: { ...clock.generator, period: 4 }, edgeCounter: { ...clock.edgeCounter, show: true, mode: "both" as const, startNumber: 10, labelEvery: 2 } }, base.signals[1]!],
    };
    const complete = buildExportScene(document, { format: "svg", scope: "document" });
    const bounded = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 42, end: 50 } });
    const expected = complete.edgeCounters.filter((edge) => edge.cycle >= 42 && edge.cycle < 50).map(({ cycle, kind, label }) => ({ cycle, kind, label }));
    expect(bounded.edgeCounters.map(({ cycle, kind, label }) => ({ cycle, kind, label }))).toEqual(expected);
  });

  it("bounds range-relative edge counters with enable changes and suppressed periods", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 100, cycleCount: 100 },
      signals: [{
        ...clock,
        generator: { ...clock.generator, period: 4, duty: 0.5, suppressedPeriods: [14] },
        enable: [{ start: 0, value: 1 }, { start: 44, value: 0 }, { start: 52, value: 1 }],
        edgeCounter: { ...clock.edgeCounter, show: true, mode: "both" as const, startNumber: 10, countFrom: "visible-range-start" as const },
      }, base.signals[1]!],
    };

    const bounded = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 40, end: 60 } });
    expect(bounded.edgeCounters.map(({ cycle, kind, label }) => ({ cycle, kind, label }))).toEqual([
      { cycle: 40, kind: "rising", label: "10" },
      { cycle: 42, kind: "falling", label: "11" },
      { cycle: 52, kind: "rising", label: "12" },
      { cycle: 54, kind: "falling", label: "13" },
    ]);
  });

  it("uses the configured Bookmark rather than the earliest Bookmark for export", () => {
    const base = canonicalFixture();
    const markerA = { id: "bookmark_a" as BookmarkId, name: "A", start: 1 };
    const markerB = { id: "bookmark_b" as BookmarkId, name: "B", start: 6 };
    const clock = base.signals[0]!;
    const document = {
      ...base,
      bookmarks: [markerA, markerB],
      signals: [{ ...clock, edgeCounter: { ...clock.edgeCounter, show: true, countFrom: "marker" as const, anchorId: markerB.id } }, base.signals[1]!],
    };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    expect(scene.edgeCounters.length).toBeGreaterThan(0);
    expect(scene.edgeCounters.every((edge) => edge.cycle >= markerB.start)).toBe(true);
    expect(scene.edgeCounters.some((edge) => edge.cycle < markerB.start)).toBe(false);
  });

  it("uses effective duty and suppression when exporting clock edge counters", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document = {
      ...base,
      signals: [{ ...clock, generator: { ...clock.generator, period: 4, duty: 0.25, suppressedPeriods: [1] }, edgeCounter: { ...clock.edgeCounter, show: true, mode: "both" as const } }, base.signals[1]!],
    };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    expect(scene.edgeCounters.map((edge) => edge.cycle)).toEqual([0, 1]);
  });

  it("keeps edge counters independent for multiple Clock Signal IDs", () => {
    const base = canonicalFixture();
    const sourceClock = base.signals.find((signal): signal is ClockSignal => signal.type === "clock")!;
    const firstClock: ClockSignal = { ...sourceClock, id: "sig_clk_a" as SignalId, name: "CLK_A", display: { ...sourceClock.display, name: "CLK_A" }, source: { ...sourceClock.source, signalName: "CLK_A" }, edgeCounter: { ...sourceClock.edgeCounter, show: true, mode: "rising", startNumber: 10, labelEvery: 1 } };
    const secondClock: ClockSignal = { ...sourceClock, id: "sig_clk_b" as SignalId, name: "CLK_B", display: { ...sourceClock.display, name: "CLK_B" }, source: { ...sourceClock.source, signalName: "CLK_B" }, generator: { ...sourceClock.generator, start: 0, period: 4, phase: 1 }, edgeCounter: { ...sourceClock.edgeCounter, show: true, mode: "falling", startNumber: 40, labelEvery: 1 } };
    const document = { ...base, timeline: { ...base.timeline, referenceClock: firstClock.id }, signals: [firstClock, secondClock, base.signals[1]!], signalGroups: [{ ...base.signalGroups[0]!, rows: [firstClock.id, secondClock.id, base.signals[1]!.id] }] };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    const firstEdges = scene.edgeCounters.filter((edge) => edge.signalId === firstClock.id);
    const secondEdges = scene.edgeCounters.filter((edge) => edge.signalId === secondClock.id);
    expect(firstEdges.length).toBeGreaterThan(0);
    expect(secondEdges.length).toBeGreaterThan(0);
    expect(new Set(firstEdges.map((edge) => edge.label))).toContain("10");
    expect(new Set(secondEdges.map((edge) => edge.label))).toContain("40");
    expect(firstEdges.every((edge) => edge.kind === "rising")).toBe(true);
    expect(secondEdges.every((edge) => edge.kind === "falling")).toBe(true);
    expect(firstEdges.every((edge) => edge.signalId !== secondClock.id)).toBe(true);
    expect(secondEdges.every((edge) => edge.signalId !== firstClock.id)).toBe(true);
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

  it("bounds selected-range value waveforms after folded source values are remapped to display time", () => {
    const document = foldedFixture();
    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 2, end: 18 }, foldPolicy: "respect" });
    const dataWave = scene.waveforms.find((wave) => wave.signalId === document.signals[1]!.id)!;
    const waveJson = JSON.parse(dataWave.waveJson);

    // Source [2,18) maps through [5,15) -> display [2,8), six slots rather than the ten-slot full display.
    expect(scene.ruler).toMatchObject({ start: 2, end: 8 });
    expect(waveJson.wave).toHaveLength(6);
    expect(waveJson.data).toEqual(["0x00", "0xA5", "0xFF", "0x00"]);
    expect(dataWave.cropX).toBe(0);
    expect(dataWave.width).toBeCloseTo(scene.ruler.cycleWidth * 6, 5);
    expect(dataWave.sourceWidth).toBeLessThan(scene.ruler.cycleWidth * 10);
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

  it("#200: treats Signal Split as view-only during export", () => {
    const scene = buildExportScene(splitFixture(), { format: "svg", scope: "document", signalLayout: "preserve-split" });
    expect(scene.waveforms.map((wave) => wave.signalId)).toEqual(["sig_split_upper", "sig_split_shared", "sig_split_lower"]);
    expect(scene.waveforms).toHaveLength(3);
    expect(new Set(scene.waveforms.map((wave) => wave.signalId)).size).toBe(3);
    expect(scene.labels.filter((label) => label.kind === "signal")).toHaveLength(3);
    const flatScene = buildExportScene({ ...splitFixture(), signals: splitFixture().signals.map((signal) => ({ ...signal, display: { ...signal.display, splitPane: undefined } })) }, { format: "svg", scope: "document" });
    expect(scene.height).toBe(flatScene.height);
  });

  it("#443: default export merges Signal Split into canonical order and emits each signal once", () => {
    const split = splitFixture();
    const scene = buildExportScene(split, { format: "svg", scope: "document" });
    const flat = buildExportScene({
      ...split,
      signals: split.signals.map((signal) => ({ ...signal, display: { ...signal.display, splitPane: undefined } })),
    }, { format: "svg", scope: "document" });
    expect(scene.waveforms.map((wave) => wave.signalId)).toEqual(flat.waveforms.map((wave) => wave.signalId));
    expect(scene.waveforms).toHaveLength(3);
    expect(new Set(scene.waveforms.map((wave) => wave.signalId)).size).toBe(3);
    expect(scene.labels.filter((label) => label.kind === "signal")).toHaveLength(3);
    expect(scene.height).toBe(flat.height);
  });
});
