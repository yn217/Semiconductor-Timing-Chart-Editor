import { describe, expect, it, vi } from "vitest";
import { buildExportScene, DeterministicExportService, renderExportSvg } from "@timing-chart-v2/export";
import { buildDisplayTimeMapping } from "@timing-chart-v2/projection";
import { toWaveJsonMappedClock } from "@timing-chart-v2/wavedrom-adapter";
import { MAX_MEASUREMENT_LANE, type AnnotationId, type BookmarkId, type CanonicalDocument, type ClockSignal, type CommentRow, type GroupId, type SignalId, type TimeGroupId, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
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

  it("exports a canvas-corner Legend using the plot bounds and persisted offset", () => {
    const base = canonicalFixture();
    const document = { ...base, legend: { ...base.legend, show: true, positionMode: "canvas-corner" as const, corner: "top-right" as const, position: { x: 12, y: 18 } } };
    const scene = buildExportScene(document, { format: "svg", scope: "document" });
    expect(scene.legendPosition.x).toBeGreaterThan(document.legend.position.x);
    expect(scene.legendPosition.y).toBeGreaterThanOrEqual(document.legend.position.y);
    expect(renderExportSvg(scene)).toContain(`transform="translate(${scene.legendPosition.x} ${scene.legendPosition.y})"`);
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

  it("publishes export stages and aborts before the next cooperative stage", async () => {
    const controller = new AbortController();
    const stages: string[] = [];
    const exportPromise = new DeterministicExportService().export({
      format: "svg",
      snapshot: { revision: 0, document: scaleFixture(2) },
      signal: controller.signal,
      onProgress: ({ stage }) => {
        stages.push(stage);
        if (stage === "drawing") controller.abort();
      },
    });

    await expect(exportPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(stages).toEqual(["preparing", "drawing"]);
  });

  it("passes cooperative SVG chunks directly to PNG Blob without a giant joined string", async () => {
    const base = scaleFixture(2);
    const document = {
      ...base,
      transactions: Array.from({ length: 2_500 }, (_, index) => ({
        ...base.transactions[0]!,
        id: `txn_png_${index}` as TransactionId,
        name: `PNG export transaction ${index.toString().padStart(4, "0")}`,
      })),
    };
    const NativeBlob = globalThis.Blob;
    const capturedParts: BlobPart[][] = [];
    class CapturedBlob extends NativeBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        capturedParts.push([...parts]);
        super(parts, options);
      }
    }
    const context = { scale: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: (callback: BlobCallback) => callback(new CapturedBlob(["png-bytes"], { type: "image/png" })),
    };
    class FakeImage {
      src = "";
      async decode() { return undefined; }
    }
    vi.stubGlobal("Blob", CapturedBlob);
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    try {
      const png = await new DeterministicExportService().export({
        format: "png",
        snapshot: { revision: 0, document },
        settings: { scope: "document" },
      });

      expect(capturedParts[0]!.length).toBeGreaterThan(1);
      const svg = await new CapturedBlob(capturedParts[0]!, { type: "image/svg+xml" }).text();
      expect(svg).toContain('data-transaction-id="txn_png_2499"');
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(new TextDecoder().decode(png)).toBe("png-bytes");
      expect(context.drawImage).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("cooperatively encodes multi-chunk SVG output without changing bytes", async () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      document: { ...base.document, title: "Cycle 🧭 日本語" },
      timeline: { ...base.timeline, end: 4096, cycleCount: 4096 },
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
      expect(yieldTask.mock.calls.length).toBeGreaterThanOrEqual(4);
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

  it("keeps 100 Signal WaveDrom artifacts bounded for a narrow range on a 100k-cycle timeline", () => {
    const base = scaleFixture(100);
    const document = {
      ...base,
      timeline: { ...base.timeline, cycleCount: 100_000, end: 100_000 },
      signals: base.signals.map((signal) => ({ ...signal, values: [{ start: 0, value: "00" }, { start: 50_000, value: "A5" }, { start: 99_999, value: "FF" }] })),
    };

    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 50_000, end: 50_012 } });

    expect(scene.waveforms).toHaveLength(100);
    for (const waveform of scene.waveforms) {
      const waveJson = JSON.parse(waveform.waveJson) as { wave: string; data?: readonly string[] };
      expect(waveJson.wave).toHaveLength(12);
      expect(waveJson.data).toEqual(["0xA5"]);
      expect(waveform.sourceWidth).toBeLessThan(100_000 * 20);
      expect(waveform.cropX).toBe(0);
    }
  });

  it("reads only each selected window from 100 value histories with 100k changes", () => {
    const base = scaleFixture(100);
    let numericReads = 0;
    const values = new Proxy([] as ValueSignal["values"], {
      get(target, property, receiver) {
        if (property === "length") return 100_000;
        if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) {
          numericReads += 1;
          const index = Number(property);
          return index < 100_000 ? { start: index, value: index % 2 === 0 ? "00" : "A5" } : undefined;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 100_000, cycleCount: 100_000 },
      signals: base.signals.map((signal) => ({ ...signal, values })),
    };

    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 90_000, end: 90_020 } });

    expect(scene.waveforms).toHaveLength(100);
    expect(scene.waveforms.every((wave) => JSON.parse(wave.waveJson).wave.length === 20)).toBe(true);
    expect(JSON.parse(scene.waveforms[0]!.waveJson).data).toEqual(Array.from({ length: 20 }, (_, index) => index % 2 === 0 ? "0x00" : "0xA5"));
    expect(numericReads).toBeLessThan(100 * 40);
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

  it("reuses effective WaveDrom tokens for multiple Ghost Traces from one Signal", () => {
    const base = canonicalFixture();
    const source = base.signals[1]!;
    const ghost = (id: string, start: number, end: number, offset: number) => ({
      id: id as AnnotationId,
      type: "ghostTrace" as const,
      label: id,
      visible: true,
      sourceSignalId: source.id,
      traceOffsetCycles: offset,
      start: { signalId: source.id, cycle: start, point: "cycle-start" as const },
      end: { signalId: source.id, cycle: end, point: "cycle-end" as const },
    });
    const firstGhost = ghost("ann_ghost_first", 1, 5, -1);
    const secondGhost = ghost("ann_ghost_second", 3, 7, 1);
    const combined = buildExportScene({ ...base, annotations: [firstGhost, secondGhost] }, { format: "svg", scope: "document" });
    const firstOnly = buildExportScene({ ...base, annotations: [firstGhost] }, { format: "svg", scope: "document" });
    const secondOnly = buildExportScene({ ...base, annotations: [secondGhost] }, { format: "svg", scope: "document" });

    expect(combined.annotations.find((item) => item.id === firstGhost.id)?.tracePoints)
      .toEqual(firstOnly.annotations.find((item) => item.id === firstGhost.id)?.tracePoints);
    expect(combined.annotations.find((item) => item.id === secondGhost.id)?.tracePoints)
      .toEqual(secondOnly.annotations.find((item) => item.id === secondGhost.id)?.tracePoints);
    expect(renderExportSvg(combined)).toContain('data-annotation-id="ann_ghost_second"');
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
    expect(wave).toHaveLength(3);
    expect(trace).toHaveLength(3);
    expect(trace.map((point) => point.y)).toEqual([
      traceWave.y - traceWave.sourceHeight / 2 + 20,
      traceWave.y - traceWave.sourceHeight / 2,
      traceWave.y - traceWave.sourceHeight / 2 + 20,
    ]);
  });

  it("skips redundant samples in a long collapsed Ghost Trace while preserving its visible path", async () => {
    const base = canonicalFixture();
    const source = base.signals[1]!;
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 1024, cycleCount: 1024 },
      timeGroups: [{ id: "tg_long_export" as TimeGroupId, name: "Collapsed", start: 2, end: 1000, presentation: { collapsed: true } }],
      annotations: [{ id: "ann_long_folded_ghost" as AnnotationId, type: "ghostTrace" as const, label: "Long", visible: true, sourceSignalId: source.id, start: { signalId: source.id, cycle: 0, point: "cycle-start" as const }, end: { signalId: source.id, cycle: 1024, point: "cycle-end" as const } }],
    };
    const settings = { scope: "selected-range" as const, range: { start: 0, end: 5 } };
    const scene = buildExportScene(document, { format: "svg", ...settings });
    const expected = renderExportSvg(scene);
    const sourceWave = scene.waveforms.find((wave) => wave.signalId === document.annotations[0]!.sourceSignalId)!;
    const trace = scene.annotations.find((annotation) => annotation.id === "ann_long_folded_ghost")!.tracePoints!;
    expect(JSON.parse(sourceWave.waveJson).wave).toHaveLength(scene.ruler.end - scene.ruler.start);
    expect(trace.map((point) => point.x)).toEqual([0, 1, 2, 3].map((displayCycle) => scene.ruler.x + displayCycle * scene.ruler.cycleWidth));
    expect(trace).toHaveLength(4);
    const service = new DeterministicExportService();
    const yieldTask = vi.fn(async () => undefined);
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
    vi.stubGlobal("scheduler", { yield: yieldTask });
    try {
      const actual = new TextDecoder().decode(await service.export({ format: "svg", snapshot: { revision: 0, document }, settings }));
      expect(yieldTask.mock.calls.length).toBeLessThan(10);
      expect(actual).toBe(expected);
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("bounds folded Ghost Trace sampling to a distant selected display window", async () => {
    const base = foldedFixture();
    const source = base.signals[1]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 100_000, cycleCount: 100_000 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [source.id] }],
      signals: [source],
      annotations: [{ id: "ann_distant_folded_ghost" as AnnotationId, type: "ghostTrace", label: "Distant", visible: true, sourceSignalId: source.id, traceOffsetCycles: -0.5, start: { signalId: source.id, cycle: 0, point: "cycle-start" }, end: { signalId: source.id, cycle: 100_000, point: "cycle-end" } }],
    };
    const settings = { scope: "selected-range" as const, range: { start: 50_000, end: 50_010 }, foldPolicy: "respect" as const };
    const yieldTask = vi.fn(async () => undefined);
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
    vi.stubGlobal("scheduler", { yield: yieldTask });
    try {
      const scene = buildExportScene(document, { format: "svg", ...settings });
      const service = new DeterministicExportService();
      const actual = new TextDecoder().decode(await service.export({ format: "svg", snapshot: { revision: 0, document }, settings }));
      const ghost = scene.annotations.find((annotation) => annotation.id === "ann_distant_folded_ghost");
      const sourceWave = scene.waveforms.find((wave) => wave.signalId === source.id)!;

      expect(ghost?.tracePoints).toHaveLength(11);
      expect(ghost?.tracePoints?.map((point) => point.x)).toEqual(Array.from({ length: 11 }, (_, index) => scene.ruler.x + index * scene.ruler.cycleWidth));
      expect(JSON.parse(sourceWave.waveJson).wave).toHaveLength(scene.ruler.end - scene.ruler.start);
      expect(yieldTask.mock.calls.length).toBeLessThan(20);
      expect(actual).toContain('data-annotation-id="ann_distant_folded_ghost"');
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("retains folded Ghost Trace samples that floor-map to the selected range endpoint", () => {
    const base = canonicalFixture();
    const source = base.signals[1]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 8, cycleCount: 8 },
      timeGroups: [{ id: "tg_trace_endpoint" as TimeGroupId, name: "Collapsed", start: 2, end: 5, presentation: { collapsed: true } }],
      annotations: [{ id: "ann_trace_endpoint" as AnnotationId, type: "ghostTrace", label: "Endpoint", visible: true, sourceSignalId: source.id, start: { signalId: source.id, cycle: 0, point: "cycle-start" }, end: { signalId: source.id, cycle: 7, point: "cycle-end" } }],
    };

    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 0, end: 2 }, foldPolicy: "respect" });
    const ghost = scene.annotations.find((annotation) => annotation.id === "ann_trace_endpoint");
    const fullGhost = buildExportScene(document, { format: "svg", scope: "document", foldPolicy: "respect" }).annotations.find((annotation) => annotation.id === "ann_trace_endpoint");

    // Source cycles 2..4 are hidden and floor-map to display cycle 1;
    // cycle 5 maps to the inclusive selected-range right endpoint (2).
    // The hidden points are identical duplicates, so the selected-range path
    // is compared with the full path after only consecutive duplicate removal.
    const fullVisiblePath = fullGhost?.tracePoints?.filter((point) => point.x <= scene.ruler.x + scene.ruler.cycleWidth * 2)
      .filter((point, index, points) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y);
    expect(ghost?.tracePoints).toEqual(fullVisiblePath);
    expect(ghost?.tracePoints?.map((point) => point.x)).toEqual([
      scene.ruler.x,
      scene.ruler.x + scene.ruler.cycleWidth,
      scene.ruler.x + scene.ruler.cycleWidth * 2,
    ]);
  });

  it("yields while projecting dense Measurement lanes without changing SVG bytes", async () => {
    const base = canonicalFixture();
    const signal = base.signals[1]!;
    const document = {
      ...base,
      annotations: Array.from({ length: 256 }, (_, index) => ({
        id: `ann_measurement_${index}` as AnnotationId,
        type: "measurement" as const,
        label: `M${index}`,
        visible: true,
        start: { signalId: signal.id, cycle: 1, point: "cycle-start" as const },
        end: { signalId: signal.id, cycle: 4, point: "cycle-end" as const },
      })),
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
      expect(yieldTask).toHaveBeenCalled();
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
      expect(yieldTask.mock.calls.length).toBeGreaterThanOrEqual(3);
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

  it("resolves distant selected Clock windows from indexed enable state", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    let numericReads = 0;
    const enable = new Proxy(Array.from({ length: 25_000 }, (_, index) => ({ start: index * 4, value: index % 2 === 0 ? 1 : 0 })), {
      get(target, property, receiver) {
        if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) numericReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 100_000, cycleCount: 100_000 },
      signals: [{
        ...clock,
        generator: { ...clock.generator, period: 4, duty: 0.5 },
        enable,
        edgeCounter: { ...clock.edgeCounter, show: true, mode: "both" as const, countFrom: "visible-range-start" as const, startNumber: 7 },
      }, base.signals[1]!],
    };

    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 90_000, end: 90_020 } });
    const wave = scene.waveforms.find((item) => item.signalId === clock.id)!;

    expect(JSON.parse(wave.waveJson).wave).toHaveLength(5);
    expect(scene.edgeCounters.map(({ cycle, kind, label }) => ({ cycle, kind, label }))).toEqual([
      { cycle: 90_000, kind: "rising", label: "7" },
      { cycle: 90_002, kind: "falling", label: "8" },
      { cycle: 90_008, kind: "rising", label: "9" },
      { cycle: 90_010, kind: "falling", label: "10" },
      { cycle: 90_016, kind: "rising", label: "11" },
      { cycle: 90_018, kind: "falling", label: "12" },
    ]);
    expect(numericReads).toBeLessThan(100);
  });

  it("bounds folded range-relative Clock edge enumeration through the shared display mapping", async () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 10_000, cycleCount: 10_000 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [clock.id] }],
      signals: [{ ...clock, generator: { ...clock.generator, period: 4 }, edgeCounter: { ...clock.edgeCounter, show: true, mode: "both", countFrom: "visible-range-start", startNumber: 10 } }],
      timeGroups: [{ id: "tg_edge_window" as TimeGroupId, name: "Collapsed", start: 5, end: 15, presentation: { collapsed: true } }],
    };
    const settings = { scope: "selected-range" as const, range: { start: 5_000, end: 5_010 }, foldPolicy: "respect" as const };
    const yieldTask = vi.fn(async () => undefined);
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
    vi.stubGlobal("scheduler", { yield: yieldTask });
    try {
      const scene = buildExportScene(document, { format: "svg", ...settings });
      await new DeterministicExportService().export({ format: "svg", snapshot: { revision: 0, document }, settings });

      expect(scene.edgeCounters.map(({ cycle, kind, label }) => ({ cycle, kind, label }))).toEqual([
        { cycle: 5_000, kind: "rising", label: "10" },
        { cycle: 5_002, kind: "falling", label: "11" },
        { cycle: 5_004, kind: "rising", label: "12" },
        { cycle: 5_006, kind: "falling", label: "13" },
        { cycle: 5_008, kind: "rising", label: "14" },
      ]);
      expect(yieldTask.mock.calls.length).toBeLessThan(20);
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("bounds a folded selected Clock waveform when the source/display offset preserves its period phase", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const enableChanges = Array.from({ length: 2_500 }, (_, index) => ({ start: index * 4, value: index % 2 === 0 ? 1 : 0 }));
    let numericReads = 0;
    const countedEnable = new Proxy(enableChanges, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) numericReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 10_000, cycleCount: 10_000 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [clock.id] }],
      signals: [{ ...clock, generator: { ...clock.generator, period: 4 }, enable: countedEnable }],
      timeGroups: [{ id: "tg_clock_window" as TimeGroupId, name: "Earlier fold", start: 4, end: 12, presentation: { collapsed: true } }],
    };

    const range = { start: 100, end: 120 };
    const selected = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 108, end: 128 } });
    expect(numericReads).toBeLessThan(100);
    const selectedWave = JSON.parse(selected.waveforms[0]!.waveJson) as { wave: string; period?: number; sourceWindow: { start: number; end: number }; displayWindow: { start: number; end: number } };
    const fullDocument = { ...document, signals: [{ ...clock, generator: { ...clock.generator, period: 4 }, enable: enableChanges }] };
    const full = buildExportScene(fullDocument, { format: "svg", scope: "document" });
    const fullWave = JSON.parse(full.waveforms[0]!.waveJson) as { wave: string; period?: number };

    expect(selectedWave).toMatchObject({
      wave: fullWave.wave.slice(range.start / 4, range.end / 4),
      period: 4,
      sourceWindow: { start: 108, end: 128 },
      displayWindow: range,
    });
    expect(selectedWave.wave).toHaveLength(5);
    expect(fullWave.wave.length).toBeGreaterThan(2_000);
    const short = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 108, end: 110 } });
    const shortWave = JSON.parse(short.waveforms[0]!.waveJson) as { wave: string; sourceWindow?: unknown };
    expect(shortWave.sourceWindow).toBeUndefined();
    expect(shortWave.wave.length).toBeGreaterThan(2_000);

    const phaseShiftedDocument = {
      ...document,
      timeGroups: [{ id: "tg_clock_phase_shift" as TimeGroupId, name: "Phase-shifting fold", start: 4, end: 14, presentation: { collapsed: true } }],
      signals: [{ ...clock, generator: { ...clock.generator, period: 4 }, enable: undefined }],
    };
    const phaseShifted = buildExportScene(phaseShiftedDocument, { format: "svg", scope: "selected-range", range: { start: 110, end: 130 } });
    const phaseShiftedWave = JSON.parse(phaseShifted.waveforms[0]!.waveJson) as { wave: string; sourceWindow?: unknown; displayWindow: { start: number; end: number } };
    const phaseMapping = buildDisplayTimeMapping(phaseShiftedDocument.timeline, phaseShiftedDocument.timeGroups);
    const phaseSources = Array.from({ length: 20 }, (_, index) => phaseMapping.displayToSource(100 + index)!);
    const phaseExpected = toWaveJsonMappedClock({ signal: phaseShiftedDocument.signals[0]!, cycleCount: phaseShiftedDocument.timeline.cycleCount, enumDefinitions: phaseShiftedDocument.enumDefinitions }, phaseSources);
    expect(phaseShiftedWave.sourceWindow).toBeUndefined();
    expect(phaseShiftedWave.displayWindow).toEqual({ start: 100, end: 120 });
    expect(phaseShiftedWave.wave).toBe(phaseExpected.wave);
    expect(phaseShiftedWave.wave).toHaveLength(20);
  });

  it("bounds a selected Clock waveform across multiple period-aligned folds", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const enable = Array.from({ length: 2_500 }, (_, index) => ({ start: index * 4, value: index % 2 === 0 ? 1 : 0 }));
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 10_000, cycleCount: 10_000 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [clock.id] }],
      signals: [{ ...clock, generator: { ...clock.generator, period: 4 }, enable }],
      timeGroups: [
        { id: "tg_clock_before_window" as TimeGroupId, name: "Earlier", start: 100, end: 108, presentation: { collapsed: true } },
        { id: "tg_clock_inside_window" as TimeGroupId, name: "Inside", start: 200, end: 208, presentation: { collapsed: true } },
      ],
    };
    const range = { start: 188, end: 212 };
    const bounded = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 196, end: 228 } });
    const boundedWave = JSON.parse(bounded.waveforms[0]!.waveJson) as { wave: string; period?: number; sourceWindow?: unknown; displayWindow: { start: number; end: number } };
    const full = buildExportScene(document, { format: "svg", scope: "document" });
    const fullWave = JSON.parse(full.waveforms[0]!.waveJson) as { wave: string };

    expect(boundedWave).toMatchObject({
      wave: fullWave.wave.slice(range.start / 4, range.end / 4),
      period: 4,
      displayWindow: range,
    });
    expect(boundedWave.sourceWindow).toBeUndefined();
    expect(boundedWave.wave).toHaveLength((range.end - range.start) / 4);
    expect(fullWave.wave.length).toBeGreaterThan(2_000);
  });

  it("keeps selected folded Clock export bounded when the fold shifts period phase", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 10_000, cycleCount: 10_000 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [clock.id] }],
      signals: [{ ...clock, generator: { ...clock.generator, start: 108, period: 4, suppressedPeriods: [0] } }],
      timeGroups: [{ id: "tg_clock_phase_shift" as TimeGroupId, name: "Phase-shifting fold", start: 4, end: 14, presentation: { collapsed: true } }],
    };
    const requestedSourceRange = { start: 100, end: 120 };
    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: requestedSourceRange, foldPolicy: "respect" });
    const selectedWave = JSON.parse(scene.waveforms[0]!.waveJson) as { wave: string; displayWindow: { start: number; end: number } };
    const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
    const sourceCycles = Array.from({ length: 20 }, (_, index) => mapping.displayToSource(90 + index)!);
    const expected = toWaveJsonMappedClock({ signal: document.signals[0]!, cycleCount: document.timeline.cycleCount, enumDefinitions: document.enumDefinitions }, sourceCycles);
    const full = buildExportScene(document, { format: "svg", scope: "document", foldPolicy: "respect" });
    const fullWave = JSON.parse(full.waveforms[0]!.waveJson) as { wave: string };

    expect(selectedWave.displayWindow).toEqual({ start: 90, end: 110 });
    expect(selectedWave.wave).toBe(expected.wave);
    expect(selectedWave.wave).toHaveLength(20);
    expect(fullWave.wave.length).toBeGreaterThan(1_000);
  });

  it("evaluates bounded folded Clock start and suppressed pulse ordinals in source time", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 200, cycleCount: 200 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [clock.id] }],
      signals: [{ ...clock, generator: { ...clock.generator, start: 108, period: 4, suppressedPeriods: [1] } }],
      timeGroups: [{ id: "tg_clock_source_start" as TimeGroupId, name: "Earlier fold", start: 20, end: 28, presentation: { collapsed: true } }],
    };

    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 104, end: 120 }, foldPolicy: "respect" });
    const wave = JSON.parse(scene.waveforms[0]!.waveJson) as { wave: string; displayWindow: { start: number; end: number } };

    // Display 100 maps to source 108, where this delayed Clock starts.
    expect(wave.displayWindow).toEqual({ start: 96, end: 112 });
    expect(wave.wave).toBe("0p0p");

    const foldedPulseDocument: CanonicalDocument = {
      ...document,
      signals: [{ ...clock, generator: { ...clock.generator, start: 96, period: 4, suppressedPeriods: [1] } }],
      timeGroups: [{ id: "tg_clock_hidden_suppression" as TimeGroupId, name: "Hidden pulse", start: 100, end: 108, presentation: { collapsed: true } }],
    };
    const afterHiddenPulse = buildExportScene(foldedPulseDocument, { format: "svg", scope: "selected-range", range: { start: 96, end: 120 }, foldPolicy: "respect" });
    const foldedWave = JSON.parse(afterHiddenPulse.waveforms[0]!.waveJson) as { wave: string };

    // Source pulse 1 (cycle 100) is hidden in the fold; it must not suppress
    // the visible source pulse 3 (cycle 108) that resumes at display cycle 100.
    expect(foldedWave.wave).toBe("p...");
  });

  it("preserves source pulse ordinals across multiple folds with enable and suppression", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 200, cycleCount: 200 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [clock.id] }],
      signals: [{
        ...clock,
        generator: { ...clock.generator, start: 108, period: 4, suppressedPeriods: [1, 5, 7] },
        enable: [{ start: 108, value: 1 }, { start: 120, value: 0 }, { start: 132, value: 1 }],
      }],
      timeGroups: [
        { id: "tg_clock_before_start_multi" as TimeGroupId, name: "Before start", start: 20, end: 28, presentation: { collapsed: true } },
        { id: "tg_clock_hidden_pulse_multi" as TimeGroupId, name: "Hidden pulse", start: 124, end: 132, presentation: { collapsed: true } },
      ],
    };
    const sourceRange = { start: 104, end: 140 };
    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: sourceRange, foldPolicy: "respect" });
    const wave = JSON.parse(scene.waveforms[0]!.waveJson) as { wave: string; displayWindow?: { start: number; end: number } };

    // Build the oracle from canonical source cycles: display slots only choose
    // which source pulses are visible; start, enable, and suppression remain
    // source-domain properties.
    const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
    const expectedTokens: string[] = [];
    let previousToken: string | undefined;
    for (let display = 96; display < 124; display += 4) {
      const source = mapping.displayToSource(display)!;
      const enable = [...document.signals[0]!.enable!].reverse().find((change) => change.start <= source)?.value ?? 1;
      const generator = document.signals[0]!.generator;
      const ordinal = source < generator.start ? -1 : (source - generator.start) / generator.period;
      const active = source >= generator.start && Boolean(enable) && !generator.suppressedPeriods?.includes(ordinal);
      const token = active ? (generator.polarity === "positive" ? "p" : "n") : String(generator.initial);
      expectedTokens.push(token === previousToken ? "." : token);
      previousToken = token;
    }

    expect(wave.displayWindow).toEqual({ start: 96, end: 124 });
    expect(wave.wave).toBe(expectedTokens.join(""));
    expect(wave.wave).toBe("0p0p0p0");
  });

  it("bounds folded signal-start Clock counters while preserving global ordinals", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 100_000, cycleCount: 100_000 },
      signalGroups: [{ ...base.signalGroups[0]!, rows: [clock.id] }],
      signals: [{ ...clock, generator: { ...clock.generator, period: 4 }, edgeCounter: { ...clock.edgeCounter, show: true, mode: "both", countFrom: "signal-start", startNumber: 23 } }],
      timeGroups: [{ id: "tg_signal_start_window" as TimeGroupId, name: "Earlier fold", start: 100, end: 900, presentation: { collapsed: true } }],
    };

    const full = buildExportScene(document, { format: "svg", scope: "document", foldPolicy: "respect" });
    const bounded = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 50_800, end: 50_820 }, foldPolicy: "respect" });
    const selected = full.edgeCounters.filter((edge) => edge.cycle >= 50_800 && edge.cycle < 50_820);

    expect(bounded.edgeCounters.map(({ cycle, kind, label }) => ({ cycle, kind, label }))).toEqual(
      selected.map(({ cycle, kind, label }) => ({ cycle, kind, label })),
    );
  });

  it("walks full-export Clock enable changes once in cycle order", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const document = {
      ...base,
      timeline: { ...base.timeline, end: 24, cycleCount: 24 },
      signals: [{
        ...clock,
        generator: { ...clock.generator, period: 4, duty: 0.5 },
        enable: [{ start: 0, value: 1 }, { start: 8, value: 0 }, { start: 16, value: 1 }],
        edgeCounter: { ...clock.edgeCounter, show: true, mode: "both" as const, labelEvery: 1 },
      }, base.signals[1]!],
    };

    const scene = buildExportScene(document, { format: "svg", scope: "document" });

    expect(scene.edgeCounters.map(({ cycle, kind }) => [cycle, kind])).toEqual([
      [0, "rising"], [2, "falling"], [4, "rising"], [6, "falling"],
      [16, "rising"], [18, "falling"], [20, "rising"], [22, "falling"],
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

  it("remaps only the source changes needed by a narrow folded export window", () => {
    const base = foldedFixture();
    const sourceValues = Array.from({ length: 1_000 }, (_, index) => ({ start: index * 10, value: `V${index}` }));
    let indexedReads = 0;
    const trackedValues = new Proxy(sourceValues, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const source = base.signals[1]!;
    const document: CanonicalDocument = {
      ...base,
      timeline: { ...base.timeline, end: 10_000, cycleCount: 10_000 },
      signals: [base.signals[0]!, { ...source, values: trackedValues }],
    };

    const scene = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 5_000, end: 5_010 }, foldPolicy: "respect" });
    const wave = scene.waveforms.find((item) => item.signalId === source.id)!;

    expect(scene.ruler).toMatchObject({ start: 4_990, end: 5_000 });
    expect(JSON.parse(wave.waveJson).wave).toHaveLength(10);
    expect(indexedReads).toBeLessThan(100);
    expect(wave.sourceWidth).toBeLessThan(scene.ruler.cycleWidth * scene.ruler.end);
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

  it("carries standalone LabelAnchor ruler labels into PNG raster input and PDF output", async () => {
    const base = canonicalFixture();
    const document = { ...base, timeline: { ...base.timeline, cycleCount: 20, end: 20, labelAnchors: [{ id: "la_multiformat" as never, source: 5, display: 1000 }] } };
    const snapshot = { revision: 0, document };
    const service = new DeterministicExportService();
    const svg = new TextDecoder().decode(await service.export({ format: "svg", snapshot }));
    expect(svg).toContain(">1000<");
    expect(svg).not.toContain('data-axis-break-id=');

    // The Node PDF path embeds the same deterministic SVG bytes in its
    // canonical comment; this guards shared ruler mapping without parsing a
    // lossy image representation.
    const pdf = new TextDecoder().decode(await service.export({ format: "pdf", snapshot }));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain(">1000<");

    const NativeBlob = globalThis.Blob;
    const capturedSvgParts: BlobPart[][] = [];
    class CapturedBlob extends NativeBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        if (options?.type === "image/svg+xml") capturedSvgParts.push([...parts]);
        super(parts, options);
      }
    }
    const context = { scale: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: (callback: BlobCallback) => callback(new NativeBlob(["PNG-bytes"], { type: "image/png" })) };
    class FakeImage { src = ""; async decode() { return undefined; } }
    vi.stubGlobal("Blob", CapturedBlob);
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    try {
      const png = await service.export({ format: "png", snapshot });
      const rasterSource = await new NativeBlob(capturedSvgParts[0]!, { type: "image/svg+xml" }).text();
      expect(capturedSvgParts).toHaveLength(1);
      expect(rasterSource).toContain(">1000<");
      expect(rasterSource).not.toContain('data-axis-break-id=');
      expect(new TextDecoder().decode(png)).toBe("PNG-bytes");
      expect(context.drawImage).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shares the same folded time mapping across waveforms, transactions, and annotations", () => {
    const scene = buildExportScene(foldedFixture(), { format: "svg", scope: "document", foldPolicy: "respect" });
    // The DMA transaction (source 2..12) ends inside the collapsed [5,15) range and must clamp to
    // the display-5 fold-resume boundary rather than extending past the compressed export width.
    const transaction = scene.transactions.find((item) => item.id === "txn_export");
    // #444: the mid-fold marker (source cycle 10, hidden inside the collapsed fold) follows the live projection's "omit" policy: it is not
    // exported at all, instead of being clamped onto a neighbouring visible cycle.
    expect(transaction).toBeDefined();
    const foldBoundaryX = scene.ruler.x + (5 - scene.ruler.start) * scene.ruler.cycleWidth;
    expect(transaction!.x + transaction!.width).toBeCloseTo(foldBoundaryX, 5);
    expect(scene.annotations.find((item) => item.id === "ann_export")).toBeUndefined();
  });

  describe("#444 folded Annotation anchors follow the live omit / continuous policy", () => {
    const fixture = (annotations: CanonicalDocument["annotations"], extra: Partial<CanonicalDocument> = {}) => ({ ...foldedFixture(), annotations, ...extra }) as CanonicalDocument;
    const signalId = () => foldedFixture().signals[1]!.id;
    const marker = (id: string, cycle: number, point: "cycle-start" | "cycle-center" | "cycle-end", extra: Record<string, unknown> = {}) => ({ id: id as AnnotationId, type: "marker" as const, label: id, anchor: { signalId: signalId(), cycle, point }, ...extra });
    const exported = (document: CanonicalDocument, settings: Record<string, unknown> = {}) => buildExportScene(document, { format: "svg", scope: "document", foldPolicy: "respect", ...settings } as never);
    const xAt = (scene: ReturnType<typeof exported>, displayCycle: number) => scene.ruler.x + (displayCycle - scene.ruler.start) * scene.ruler.cycleWidth;

    it("omits hidden cycle-start, cycle-center and cycle-end anchors and keeps visible ones with source-exact positions", () => {
      const scene = exported(fixture([marker("hid_start", 7, "cycle-start"), marker("hid_center", 7, "cycle-center"), marker("hid_end", 7, "cycle-end"), marker("vis_start", 2, "cycle-start"), marker("vis_center", 2, "cycle-center"), marker("vis_end", 2, "cycle-end")]));
      expect(scene.annotations.map((item) => item.id).sort()).toEqual(["vis_center", "vis_end", "vis_start"]);
      const byId = (id: string) => scene.annotations.find((item) => item.id === id)!;
      expect(byId("vis_start").x1).toBeCloseTo(xAt(scene, 2), 5);
      expect(byId("vis_center").x1).toBeCloseTo(xAt(scene, 2.5), 5);
      expect(byId("vis_end").x1).toBeCloseTo(xAt(scene, 3), 5);
    });

    it("drops a Measurement with one hidden endpoint instead of stretching it to a neighbouring cycle", () => {
      const measurement = (id: string, from: number, to: number) => ({ id: id as AnnotationId, type: "measurement" as const, label: id, start: { signalId: signalId(), cycle: from, point: "cycle-start" as const }, end: { signalId: signalId(), cycle: to, point: "cycle-start" as const } });
      const scene = exported(fixture([measurement("m_hidden_end", 2, 8), measurement("m_visible", 1, 3)]));
      expect(scene.annotations.map((item) => item.id)).toEqual(["m_visible"]);
    });

    it("free-position anchors use the shared continuous policy: interpolated between visible cycles, still omitted inside a fully hidden fold", () => {
      const scene = exported(fixture([marker("free_visible", 2.5, "cycle-start", { positionMode: "free" }), marker("free_hidden", 10, "cycle-start", { positionMode: "free" })]));
      expect(scene.annotations.map((item) => item.id)).toEqual(["free_visible"]);
      expect(scene.annotations[0]!.x1).toBeCloseTo(xAt(scene, 2.5), 5);
    });

    it("keeps the terminal-boundary anchor and agrees between full-document and selected-range Respect Folds", () => {
      const document = fixture([marker("terminal", 20, "cycle-start"), marker("hid", 7, "cycle-start"), marker("vis", 3, "cycle-start")]);
      const full = exported(document);
      expect(full.annotations.map((item) => item.id).sort()).toEqual(["terminal", "vis"]);
      expect(full.annotations.find((item) => item.id === "terminal")!.x1).toBeCloseTo(xAt(full, full.ruler.start + (full.ruler.end - full.ruler.start)), 5);
      const ranged = exported(document, { scope: "selected-range", range: { start: 0, end: 20 } });
      expect(ranged.annotations.map((item) => item.id).sort()).toEqual(full.annotations.map((item) => item.id).sort());
    });

    it("multiple folds and folds at the document start/end keep exactly the visible anchors at source-exact display slots", () => {
      const groups = [
        { id: "tg_a" as TimeGroupId, name: "Head", start: 0, end: 2, presentation: { collapsed: true } },
        { id: "tg_b" as TimeGroupId, name: "Mid", start: 6, end: 9, presentation: { collapsed: true } },
        { id: "tg_c" as TimeGroupId, name: "Tail", start: 17, end: 20, presentation: { collapsed: true } },
      ];
      const scene = exported({ ...fixture([marker("in_head", 1, "cycle-start"), marker("after_head", 2, "cycle-start"), marker("in_mid", 7, "cycle-center"), marker("between", 12, "cycle-start"), marker("in_tail", 18, "cycle-end")]), timeGroups: groups } as CanonicalDocument);
      expect(scene.annotations.map((item) => item.id).sort()).toEqual(["after_head", "between"]);
      // Source cycle 2 is the first visible cycle after the head fold (display 0); source 12 is display 12 - 2 - 3 = 7.
      expect(scene.annotations.find((item) => item.id === "after_head")!.x1).toBeCloseTo(xAt(scene, 0), 5);
      expect(scene.annotations.find((item) => item.id === "between")!.x1).toBeCloseTo(xAt(scene, 7), 5);

      // Assert the final SVG geometry too, not only the intermediate scene projection.
      const svg = renderExportSvg(scene);
      expect(svg).not.toContain('data-annotation-id="in_mid"');
      const markerMarkup = svg.match(/<g data-annotation-id="between"[^>]*>(.*?)<\/g>/)?.[1];
      const tick = markerMarkup?.match(/<line data-role="marker-tick" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/);
      expect(tick).not.toBeNull();
      expect(Number(tick![1])).toBeCloseTo(xAt(scene, 7), 5);
      expect(Number(tick![3])).toBeCloseTo(xAt(scene, 7), 5);
    });

    it("exports every anchor at its source-exact position when nothing is folded (Expand All)", () => {
      const scene = exported({ ...fixture([marker("a", 7, "cycle-start"), marker("b", 7, "cycle-end")]), timeGroups: [] } as CanonicalDocument);
      expect(scene.annotations.map((item) => item.id).sort()).toEqual(["a", "b"]);
      expect(scene.annotations.find((item) => item.id === "a")!.x1).toBeCloseTo(xAt(scene, 7), 5);
      expect(scene.annotations.find((item) => item.id === "b")!.x1).toBeCloseTo(xAt(scene, 8), 5);
    });
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

  it("places cycle-center / cycle-end anchors on the same boundary as the live geometry and stacks fully overlapping Measurements on distinct lanes (#866)", () => {
    const base = scaleFixture(2);
    const signalId = base.signals[0]!.id;
    const measurement = (id: string) => ({ id: id as AnnotationId, type: "measurement" as const, label: id, visible: true, start: { signalId, cycle: 3, point: "cycle-start" as const }, end: { signalId, cycle: 3, point: "cycle-end" as const }, measurementLayout: { arrowLayout: "inward" as const, startMarker: "arrow" as const, endMarker: "arrow" as const, extensionLines: "start" as const } });
    const scene = buildExportScene({ ...base, annotations: [measurement("m_a"), measurement("m_b"), { id: "m_center" as AnnotationId, type: "marker" as const, label: "c", visible: true, anchor: { signalId, cycle: 3, point: "cycle-center" as const } }] }, { format: "svg", scope: "document" });
    const [first, second] = ["m_a", "m_b"].map((id) => scene.annotations.find((annotation) => annotation.id === id)!);
    const cycleWidth = second!.x2 - second!.x1;
    expect(cycleWidth).toBeGreaterThan(0);
    expect(first!.measurementLane).not.toBe(second!.measurementLane);
    const center = scene.annotations.find((annotation) => annotation.id === "m_center")!;
    expect(center.x1 - first!.x1).toBeCloseTo(cycleWidth / 2, 5);
  });
});
