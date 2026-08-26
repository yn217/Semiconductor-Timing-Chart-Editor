import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { buildDisplayTimeMapping, remapValueChangesToDisplay, type DisplayTimeMapping } from "@timing-chart-v2/projection";
import type { Annotation, CanonicalDocument, Signal, SignalId } from "@timing-chart-v2/schema";
import { renderWaveJsonMarkup, toWaveJson, WAVEDROM_VERSION } from "@timing-chart-v2/wavedrom-adapter";

export interface ExportSettings {
  readonly format: "svg" | "png" | "pdf";
  readonly scope: "document" | "selected-range";
  readonly range?: Readonly<{ start: number; end: number }>;
  readonly scale?: number;
  readonly page?: Readonly<{ size: "A4" | "Letter" | "wide"; orientation: "portrait" | "landscape"; margin: number; fit: "width" | "page" }>;
  readonly foldPolicy?: "respect" | "expand";
}

export interface ExportRequest {
  readonly format: "svg" | "png" | "pdf";
  readonly snapshot: CanonicalSnapshot;
  readonly settings?: Omit<ExportSettings, "format">;
}

export interface ExportWave { readonly signalId: SignalId; readonly name: string; readonly role: string; readonly y: number; readonly svgMarkup: string; readonly sourceWidth: number; readonly sourceHeight: number; readonly cropX: number; readonly width: number; readonly waveJson: string }
export interface ExportLabel { readonly text: string; readonly x: number; readonly y: number; readonly kind: "signal" | "group" | "annotation" | "transaction" }
export interface ExportAnnotation { readonly id: string; readonly type: string; readonly label: string; readonly x1: number; readonly x2: number; readonly y1: number; readonly y2: number; readonly opacity?: number; readonly sourceSignalId?: SignalId; readonly traceOffsetCycles?: number; readonly threshold1?: number; readonly threshold2?: number }
export interface ExportTransaction { readonly id: string; readonly name: string; readonly laneId: string; readonly x: number; readonly y: number; readonly width: number; readonly linkedSignals: readonly SignalId[] }
export interface ExportGroupBand { readonly id: string; readonly name: string; readonly y: number; readonly height: number }
export interface ExportEdgeCounter { readonly id: string; readonly signalId: SignalId; readonly kind: "rising" | "falling"; readonly cycle: number; readonly x: number; readonly y: number; readonly label: string }
export interface ExportRulerTick { readonly cycle: number; readonly text: string }
export interface ExportRuler { readonly start: number; readonly end: number; readonly x: number; readonly cycleWidth: number; readonly ticks: readonly ExportRulerTick[] }
export interface ExportDocumentLayout { readonly title: string; readonly headerLines: readonly string[]; readonly figureNumber: string; readonly revision: string; readonly footerText: string }
export interface ExportPageLayout { readonly width: number; readonly height: number; readonly margin: number; readonly fit: "width" | "page"; readonly contentScale: number; readonly contentOffsetX: number; readonly contentOffsetY: number }

export interface ExportScene {
  readonly width: number;
  readonly height: number;
  readonly waveforms: readonly ExportWave[];
  readonly labels: readonly ExportLabel[];
  readonly annotations: readonly ExportAnnotation[];
  readonly transactions: readonly ExportTransaction[];
  readonly groupBands: readonly ExportGroupBand[];
  readonly edgeCounters: readonly ExportEdgeCounter[];
  readonly legend: readonly string[];
  readonly ruler: ExportRuler;
  readonly documentLayout: ExportDocumentLayout;
  readonly page?: ExportPageLayout;
}

export interface ExportService { export(request: ExportRequest): Promise<Uint8Array> }

const LABEL_WIDTH = 220;
const ROW_HEIGHT = 34;
const TRANSACTION_HEIGHT = 28;
const HEADER_LINE_LIMIT = 112;

function wrapLayoutText(value: string, limit = HEADER_LINE_LIMIT): string[] {
  const lines: string[] = [];
  for (const sourceLine of value.split(/\r?\n/)) {
    if (sourceLine.length === 0) { lines.push(""); continue; }
    for (let offset = 0; offset < sourceLine.length; offset += limit) lines.push(sourceLine.slice(offset, offset + limit));
  }
  return lines;
}

function buildDocumentLayout(document: CanonicalDocument): ExportDocumentLayout {
  const header = document.document.header;
  const headerLines = [
    ...wrapLayoutText(header.subtitle),
    ...wrapLayoutText(header.description),
    ...wrapLayoutText(header.notes),
    ...header.preconditions.flatMap((line) => wrapLayoutText(`Precondition: ${line}`)),
    ...header.constraints.flatMap((line) => wrapLayoutText(`Constraint: ${line}`)),
    ...header.exceptions.flatMap((line) => wrapLayoutText(`Exception: ${line}`)),
  ].filter((line) => line.length > 0);
  return Object.freeze({ title: document.document.title, headerLines, figureNumber: document.document.footer.figureNumber, revision: document.document.footer.revision, footerText: document.document.footer.text });
}

function toDisplayCycle(mapping: DisplayTimeMapping, sourceCycle: number, bias: "floor" | "ceil"): number {
  const clamped = Math.max(0, Math.min(mapping.sourceToDisplay.length - 1, sourceCycle));
  const direct = mapping.sourceToDisplay[clamped];
  if (direct !== undefined) return direct;
  const scanOrder = bias === "floor"
    ? [...Array(clamped + 1).keys()].reverse().concat([...Array(mapping.sourceToDisplay.length - clamped - 1).keys()].map((offset) => clamped + 1 + offset))
    : [...Array(mapping.sourceToDisplay.length - clamped).keys()].map((offset) => clamped + offset).concat([...Array(clamped).keys()].reverse());
  for (const cycle of scanOrder) { const value = mapping.sourceToDisplay[cycle]; if (value !== undefined) return value; }
  return 0;
}

function rangeFor(document: CanonicalDocument, settings: ExportSettings, mapping: DisplayTimeMapping): { start: number; end: number } {
  const requested = settings.scope === "selected-range" ? settings.range : undefined;
  if (!requested) return { start: 0, end: mapping.displayCycleCount };
  const sourceStart = Math.max(0, Math.min(document.timeline.cycleCount - 1, Math.trunc(requested.start)));
  const sourceEnd = Math.max(sourceStart + 1, Math.min(document.timeline.cycleCount, Math.trunc(requested.end)));
  const start = toDisplayCycle(mapping, sourceStart, "floor");
  const end = Math.max(start + 1, toDisplayCycle(mapping, sourceEnd - 1, "ceil") + 1);
  return { start, end };
}

function svgDimensions(markup: string): { width: number; height: number } {
  const viewBox = /\bviewBox="[^"]*?([\d.]+)\s+([\d.]+)"/.exec(markup);
  const width = Number(/\bwidth="([\d.]+)"/.exec(markup)?.[1] ?? viewBox?.[1] ?? 0);
  const height = Number(/\bheight="([\d.]+)"/.exec(markup)?.[1] ?? viewBox?.[2] ?? 0);
  if (!(width > 0 && height > 0)) throw new Error("WaveDrom export SVG has invalid dimensions.");
  return { width, height };
}

function anchorPoint(annotation: Annotation, field: "anchor" | "start" | "end" | "from" | "to", document: CanonicalDocument, rowY: ReadonlyMap<SignalId, number>, mapping: DisplayTimeMapping, start: number, cycleWidth: number): { x: number; y: number } | undefined {
  const anchor = annotation[field];
  if (!anchor) return undefined;
  const signalId = anchor.signalId ?? document.timeline.referenceClock;
  const displayCycle = toDisplayCycle(mapping, anchor.cycle, "floor");
  const thresholdOffset = anchor.threshold === undefined ? 0 : Math.max(0, Math.min(1, anchor.threshold));
  return { x: LABEL_WIDTH + (displayCycle + thresholdOffset) * cycleWidth - start * cycleWidth + (anchor.offset?.x ?? 0), y: ((signalId ? rowY.get(signalId) : undefined) ?? 48) + (anchor.offset?.y ?? 0) };
}

function toDisplayPosition(mapping: DisplayTimeMapping, sourceCycle: number): number {
  const clamped = Math.max(0, Math.min(mapping.sourceToDisplay.length - 1, sourceCycle));
  const lower = Math.floor(clamped);
  const upper = Math.min(mapping.sourceToDisplay.length - 1, lower + 1);
  const left = mapping.sourceToDisplay[lower] ?? 0;
  const right = mapping.sourceToDisplay[upper] ?? left;
  return left + (right - left) * (clamped - lower);
}

function pageDimensions(page: NonNullable<ExportSettings["page"]>): { width: number; height: number } {
  const base = page.size === "A4" ? { width: 1123, height: 794 } : page.size === "Letter" ? { width: 1056, height: 816 } : { width: 1600, height: 900 };
  return page.orientation === "portrait" ? { width: base.height, height: base.width } : base;
}

function pageLayout(page: NonNullable<ExportSettings["page"]>, contentWidth: number, contentHeight: number): ExportPageLayout {
  if (!Number.isFinite(page.margin) || page.margin < 0) throw new Error("Export page margin must be finite and non-negative.");
  const dimensions = pageDimensions(page);
  const availableWidth = Math.max(1, dimensions.width - page.margin * 2);
  const availableHeight = Math.max(1, dimensions.height - page.margin * 2);
  const contentScale = page.fit === "page"
    ? Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
    : availableWidth / contentWidth;
  const width = page.fit === "page" ? dimensions.width : dimensions.width;
  const height = page.fit === "page" ? dimensions.height : page.margin * 2 + contentHeight * contentScale;
  return Object.freeze({
    width, height, margin: page.margin, fit: page.fit,
    contentScale,
    contentOffsetX: page.margin + (availableWidth - contentWidth * contentScale) / 2,
    contentOffsetY: page.fit === "page" ? page.margin + (availableHeight - contentHeight * contentScale) / 2 : page.margin,
  });
}

export function buildExportScene(document: CanonicalDocument, settings: ExportSettings): ExportScene {
  const documentLayout = buildDocumentLayout(document);
  const headerHeight = 38 + documentLayout.headerLines.length * 14;
  const mapping = buildDisplayTimeMapping(document.timeline, settings.foldPolicy === "expand" ? [] : document.timeGroups);
  const range = rangeFor(document, settings, mapping);
  const signals = document.signalGroups.flatMap((group) => group.rows.map((id) => document.signals.find((signal) => signal.id === id))).filter((signal): signal is Signal => signal !== undefined && signal.display.visible !== false);
  const lanes = [...new Set(document.transactions.map((transaction) => transaction.laneId ?? "lane_0"))].sort();
  const transactionTop = headerHeight + 14;
  const waveTop = transactionTop + lanes.length * TRANSACTION_HEIGHT + 34;
  const renderedWaves = signals.filter((signal) => signal.type !== "commentRow").map((signal, index) => {
    const displaySignal = signal.type === "clock"
      ? { ...signal, ...(signal.enable ? { enable: remapValueChangesToDisplay(signal.enable, mapping) } : {}) }
      : { ...signal, values: remapValueChangesToDisplay(signal.values, mapping) };
    const waveJson = toWaveJson({ signal: displaySignal, cycleCount: mapping.displayCycleCount });
    const svgMarkup = renderWaveJsonMarkup(waveJson, index);
    return { signal, waveJson, svgMarkup, ...svgDimensions(svgMarkup) };
  });
  const cycleWidth = (renderedWaves[0]?.width ?? mapping.displayCycleCount * 20) / mapping.displayCycleCount;
  const rowHeight = Math.max(ROW_HEIGHT, (renderedWaves[0]?.height ?? 30) + 4);
  const rowY = new Map(signals.map((signal, index) => [signal.id, waveTop + index * rowHeight + rowHeight / 2]));
  const waveforms = renderedWaves.map(({ signal, waveJson, svgMarkup, width: sourceWidth, height: sourceHeight }): ExportWave => ({ signalId: signal.id, name: signal.display.name, role: signal.role, y: rowY.get(signal.id)!, svgMarkup, sourceWidth, sourceHeight, cropX: range.start * cycleWidth, width: (range.end - range.start) * cycleWidth, waveJson: JSON.stringify(waveJson) }));
  const edgeCounters: ExportEdgeCounter[] = [];
  for (const { signal } of renderedWaves) {
    if (signal.type !== "clock" || !signal.edgeCounter.show) continue;
    const period = signal.generator.period;
    const start = Math.max(0, signal.generator.start + signal.generator.phase);
    const halfPeriod = period / 2;
    const edges: Array<{ kind: "rising" | "falling"; cycle: number }> = [];
    for (let cycle = start; cycle < mapping.displayCycleCount; cycle += period) {
      const activeKind = signal.generator.polarity === "positive" ? "rising" : "falling";
      const oppositeKind = activeKind === "rising" ? "falling" : "rising";
      edges.push({ kind: activeKind, cycle });
      if (cycle + halfPeriod < mapping.displayCycleCount) edges.push({ kind: oppositeKind, cycle: cycle + halfPeriod });
    }
    const selected = edges.filter((edge) => signal.edgeCounter.mode === "both" || signal.edgeCounter.mode === edge.kind);
    selected.sort((left, right) => left.cycle - right.cycle || left.kind.localeCompare(right.kind));
    const countFromDisplay = signal.edgeCounter.countFrom === "visible-range-start" || signal.edgeCounter.countFrom === "selected-edge" ? range.start
      : signal.edgeCounter.countFrom === "marker" ? Math.min(...document.bookmarks.map((bookmark) => toDisplayPosition(mapping, bookmark.start)), Number.POSITIVE_INFINITY)
        : Number.NEGATIVE_INFINITY;
    selected.filter((edge) => toDisplayPosition(mapping, edge.cycle) >= countFromDisplay).forEach((edge, index) => {
      if (index % Math.max(1, signal.edgeCounter.labelEvery) !== 0) return;
      const displayCycle = toDisplayPosition(mapping, edge.cycle);
      if (displayCycle < range.start || displayCycle >= range.end) return;
      const row = rowY.get(signal.id) ?? waveTop;
      edgeCounters.push({ id: `edge:${signal.id}:${edge.kind}:${edge.cycle}`, signalId: signal.id, kind: edge.kind, cycle: edge.cycle, x: LABEL_WIDTH + (displayCycle - range.start) * cycleWidth + signal.edgeCounter.offset.x, y: row + signal.edgeCounter.offset.y + (signal.edgeCounter.position === "above" ? -6 : 10), label: String(signal.edgeCounter.startNumber + index) });
    });
  }
  const labels: ExportLabel[] = signals.map((signal) => ({ text: signal.display.name, x: 12, y: rowY.get(signal.id)!, kind: "signal" }));
  const groupBands: ExportGroupBand[] = [];
  document.signalGroups.forEach((group) => { const ys = group.rows.map((id) => rowY.get(id as SignalId)).filter((y): y is number => y !== undefined); const first = ys[0]; if (first !== undefined) { labels.push({ text: group.name, x: 12, y: first - rowHeight / 2 - 4, kind: "group" }); groupBands.push({ id: group.id, name: group.name, y: first - rowHeight / 2, height: Math.max(rowHeight, (ys.at(-1)! - first) + rowHeight) }); } });
  const transactions = document.transactions.map((transaction): ExportTransaction | undefined => {
    const laneId = transaction.laneId ?? "lane_0";
    const displayStart = toDisplayCycle(mapping, transaction.start, "floor");
    const displayEnd = Math.max(displayStart + 1, toDisplayCycle(mapping, transaction.end, "ceil"));
    if (displayEnd <= range.start || displayStart >= range.end) return undefined;
    const x = LABEL_WIDTH + (Math.max(range.start, displayStart) - range.start) * cycleWidth;
    return { id: transaction.id, name: transaction.name, laneId, x, y: transactionTop + lanes.indexOf(laneId) * TRANSACTION_HEIGHT, width: (Math.min(range.end, displayEnd) - Math.max(range.start, displayStart)) * cycleWidth, linkedSignals: transaction.linkedSignals ?? [] };
  }).filter((transaction): transaction is ExportTransaction => transaction !== undefined);
  const annotations = document.annotations.map((annotation): ExportAnnotation | undefined => {
    const first = anchorPoint(annotation, annotation.anchor ? "anchor" : annotation.start ? "start" : "from", document, rowY, mapping, range.start, cycleWidth);
    const second = anchorPoint(annotation, annotation.end ? "end" : annotation.to ? "to" : annotation.anchor ? "anchor" : "from", document, rowY, mapping, range.start, cycleWidth);
    return first && second ? { id: annotation.id, type: annotation.type, label: annotation.label, x1: first.x, y1: first.y, x2: second.x, y2: second.y, ...(annotation.opacity === undefined ? {} : { opacity: annotation.opacity }), ...(annotation.sourceSignalId === undefined ? {} : { sourceSignalId: annotation.sourceSignalId }), ...(annotation.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: annotation.traceOffsetCycles }), ...(annotation.start?.threshold === undefined ? {} : { threshold1: annotation.start.threshold }), ...(annotation.end?.threshold === undefined ? {} : { threshold2: annotation.end.threshold }) } : undefined;
  }).filter((annotation): annotation is ExportAnnotation => annotation !== undefined);
  const contentWidth = LABEL_WIDTH + (range.end - range.start) * cycleWidth + 24;
  const contentHeight = waveTop + signals.length * rowHeight + 54 + (documentLayout.footerText || documentLayout.figureNumber || documentLayout.revision ? 18 : 0);
  const legend = document.legend.show
    ? document.legend.items?.length
      ? [...document.legend.items].filter((entry) => entry.visible).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)).map((entry) => entry.label)
      : [...new Set(signals.map((signal) => signal.role))].sort()
    : [];
  const ticks: ExportRulerTick[] = [];
  for (let cycle = range.start; cycle <= range.end; cycle += 1) ticks.push({ cycle, text: String(mapping.labelFor(cycle)) });
  const page = settings.page ? pageLayout(settings.page, contentWidth, contentHeight) : undefined;
  return Object.freeze({ width: page?.width ?? contentWidth, height: page?.height ?? contentHeight, waveforms, labels, annotations, transactions, groupBands, edgeCounters, legend, ruler: { start: range.start, end: range.end, x: LABEL_WIDTH, cycleWidth, ticks }, documentLayout, ...(page === undefined ? {} : { page }) });
}

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderExportSvg(scene: ExportScene): string {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" data-export-scene="v2" data-wave-engine="wavedrom-${WAVEDROM_VERSION}">`, `<rect width="100%" height="100%" fill="white"/>`, ...(scene.page ? [`<g data-layer="page-content" transform="translate(${scene.page.contentOffsetX} ${scene.page.contentOffsetY}) scale(${scene.page.contentScale})">`] : [])];
  const layout = scene.documentLayout;
  out.push(`<g data-layer="document-layout" font-family="Segoe UI,Arial,sans-serif" fill="#1e293b"><text data-layout="title" x="12" y="20" font-size="16" font-weight="700">${xml(layout.title)}</text>`);
  layout.headerLines.forEach((line, index) => out.push(`<text data-layout="header" x="12" y="${38 + index * 14}" font-size="10">${xml(line)}</text>`));
  out.push(`</g>`);
  out.push(`<g data-layer="ruler" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#334155" stroke="#d5dde7">`);
  const rulerTop = 24 + 38 + layout.headerLines.length * 14;
  for (const tick of scene.ruler.ticks) { const x = scene.ruler.x + (tick.cycle - scene.ruler.start) * scene.ruler.cycleWidth; out.push(`<line x1="${x}" y1="${rulerTop}" x2="${x}" y2="${scene.height - 24}"/><text x="${x + 3}" y="${rulerTop - 8}" stroke="none">${xml(tick.text)}</text>`); }
  out.push(`</g><g data-layer="transactions" font-family="Segoe UI,Arial,sans-serif" font-size="11">`);
  for (const item of scene.transactions) out.push(`<g data-transaction-id="${xml(item.id)}"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="20" rx="4" fill="#dbeafe" stroke="#2563eb"/><text x="${item.x + 6}" y="${item.y + 14}">${xml(item.name)}</text></g>`);
  out.push(`</g><g data-layer="group-bands">`);
  for (const band of scene.groupBands) out.push(`<rect data-group-id="${xml(band.id)}" x="0" y="${band.y}" width="${scene.width}" height="${band.height}" fill="#f8fafc" fill-opacity="0.22" stroke="#d8e0e9"/>`);
  out.push(`</g><g data-layer="labels" font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#1e293b">`);
  for (const label of scene.labels) out.push(`<text data-label-kind="${label.kind}" x="${label.x}" y="${label.y + 4}">${xml(label.text)}</text>`);
  out.push(`</g><g data-layer="waveforms">`);
  for (const wave of scene.waveforms) {
    const inner = wave.svgMarkup.slice(wave.svgMarkup.indexOf(">") + 1, wave.svgMarkup.lastIndexOf("</svg>"));
    out.push(`<svg data-signal-id="${xml(wave.signalId)}" data-role="${xml(wave.role)}" data-wave-json="${xml(wave.waveJson)}" x="${scene.ruler.x}" y="${wave.y - wave.sourceHeight / 2}" width="${wave.width}" height="${wave.sourceHeight}" viewBox="${wave.cropX} 0 ${wave.width} ${wave.sourceHeight}" overflow="hidden" class="WaveDrom">${inner}</svg>`);
  }
  out.push(`</g><g data-layer="annotations" font-family="Segoe UI,Arial,sans-serif" font-size="11" stroke="#dc2626" fill="none">`);
  for (const annotation of scene.annotations) {
    const metadata = `${annotation.sourceSignalId ? ` data-source-signal-id="${xml(annotation.sourceSignalId)}"` : ""}${annotation.traceOffsetCycles === undefined ? "" : ` data-trace-offset-cycles="${annotation.traceOffsetCycles}"`}${annotation.threshold1 === undefined ? "" : ` data-start-threshold="${annotation.threshold1}"`}${annotation.threshold2 === undefined ? "" : ` data-end-threshold="${annotation.threshold2}"`}`;
    if (annotation.type === "timingRegion") out.push(`<rect data-annotation-id="${xml(annotation.id)}" data-annotation-type="timingRegion"${metadata} x="${Math.min(annotation.x1, annotation.x2)}" y="0" width="${Math.max(2, Math.abs(annotation.x2 - annotation.x1))}" height="${scene.height}" fill="${xml("#d04a36")}" fill-opacity="${annotation.opacity ?? 0.16}" stroke="none"/>`);
    else if (annotation.type === "ghostTrace") out.push(`<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="ghostTrace"${metadata}><line x1="${annotation.x1}" y1="${annotation.y1}" x2="${annotation.x2}" y2="${annotation.y2}" stroke="#64748b" stroke-width="2" stroke-dasharray="6 4" opacity="${annotation.opacity ?? 0.55}"/><text x="${Math.min(annotation.x1, annotation.x2) + 4}" y="${Math.min(annotation.y1, annotation.y2) - 5}" fill="#475569" stroke="none">${xml(annotation.label)}</text></g>`);
    else out.push(`<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="${xml(annotation.type)}"><line x1="${annotation.x1}" y1="${annotation.y1}" x2="${annotation.x2}" y2="${annotation.y2}"/><text x="${Math.min(annotation.x1, annotation.x2) + 4}" y="${Math.min(annotation.y1, annotation.y2) - 5}" fill="#991b1b" stroke="none">${xml(annotation.label)}</text></g>`);
  }
  out.push(`</g><g data-layer="edge-counters" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#7c3aed" stroke="none">`);
  for (const edge of scene.edgeCounters) out.push(`<text data-edge-counter-id="${xml(edge.id)}" data-signal-id="${xml(edge.signalId)}" data-edge-kind="${edge.kind}" data-cycle="${edge.cycle}" x="${edge.x}" y="${edge.y}">${xml(edge.label)}</text>`);
  const footer = [layout.figureNumber, layout.revision, layout.footerText].filter((value) => value.length > 0).join(" · ");
  out.push(`</g><g data-layer="legend" font-family="Segoe UI,Arial,sans-serif" font-size="10">${scene.legend.map((role, index) => `<text x="${12 + index * 80}" y="${scene.height - (footer ? 30 : 12)}">${xml(role)}</text>`).join("")}</g>`);
  if (footer) out.push(`<text data-layout="footer" x="12" y="${scene.height - 12}" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#52677d">${xml(footer)}</text>`);
  if (scene.page) out.push(`</g>`);
  out.push(`</svg>`);
  return out.join("");
}

export async function rasterizeSvgToPng(svg: string, width: number, height: number, scale = 1): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export requires a 2D Canvas context.");
  context.scale(scale, scale); context.fillStyle = "white"; context.fillRect(0, 0, width, height);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.drawImage(image, 0, 0, width, height);
  } finally { URL.revokeObjectURL(url); }
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed.")), "image/png"));
  return new Uint8Array(await png.arrayBuffer());
}

function renderDeterministicNodePdf(scene: ExportScene, svg: string): Uint8Array {
  const safeSvg = svg.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 10 Tf 24 24 Td (Timing Chart V2 - ${scene.waveforms.length} signals, ${scene.transactions.length} transactions) Tj ET\n% Canonical SVG ${safeSvg}`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${scene.width} ${scene.height}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`, `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function renderExportPdf(scene: ExportScene, svg: string): Promise<Uint8Array> {
  if (typeof document === "undefined") return renderDeterministicNodePdf(scene, svg);
  const png = await rasterizeSvgToPng(svg, scene.width, scene.height);
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0)); pdf.setProducer("Timing Chart V2"); pdf.setCreator("Timing Chart V2");
  const page = pdf.addPage([scene.width, scene.height]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: scene.width, height: scene.height });
  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
}

export class DeterministicExportService implements ExportService {
  async export(request: ExportRequest): Promise<Uint8Array> {
    const settings: ExportSettings = { format: request.format, scope: request.settings?.scope ?? "document", ...request.settings };
    const scene = buildExportScene(request.snapshot.document, settings);
    const svg = renderExportSvg(scene);
    if (request.format === "svg") return new TextEncoder().encode(svg);
    if (request.format === "png") return rasterizeSvgToPng(svg, scene.width, scene.height, settings.scale ?? 1);
    return renderExportPdf(scene, svg);
  }
}
