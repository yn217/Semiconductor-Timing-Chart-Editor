import type { CanonicalSnapshot } from "@timing-chart-v2/core";
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
export interface ExportAnnotation { readonly id: string; readonly type: string; readonly label: string; readonly x1: number; readonly x2: number; readonly y1: number; readonly y2: number }
export interface ExportTransaction { readonly id: string; readonly name: string; readonly laneId: string; readonly x: number; readonly y: number; readonly width: number; readonly linkedSignals: readonly SignalId[] }
export interface ExportGroupBand { readonly id: string; readonly name: string; readonly y: number; readonly height: number }
export interface ExportRuler { readonly start: number; readonly end: number; readonly x: number; readonly cycleWidth: number }

export interface ExportScene {
  readonly width: number;
  readonly height: number;
  readonly waveforms: readonly ExportWave[];
  readonly labels: readonly ExportLabel[];
  readonly annotations: readonly ExportAnnotation[];
  readonly transactions: readonly ExportTransaction[];
  readonly groupBands: readonly ExportGroupBand[];
  readonly legend: readonly string[];
  readonly ruler: ExportRuler;
}

export interface ExportService { export(request: ExportRequest): Promise<Uint8Array> }

const LABEL_WIDTH = 220;
const ROW_HEIGHT = 34;
const TRANSACTION_HEIGHT = 28;

function rangeFor(document: CanonicalDocument, settings: ExportSettings): { start: number; end: number } {
  const requested = settings.scope === "selected-range" ? settings.range : undefined;
  if (!requested) return { start: 0, end: document.timeline.cycleCount };
  const start = Math.max(0, Math.min(document.timeline.cycleCount - 1, Math.trunc(requested.start)));
  const end = Math.max(start + 1, Math.min(document.timeline.cycleCount, Math.trunc(requested.end)));
  return { start, end };
}

function svgDimensions(markup: string): { width: number; height: number } {
  const viewBox = /\bviewBox="[^"]*?([\d.]+)\s+([\d.]+)"/.exec(markup);
  const width = Number(/\bwidth="([\d.]+)"/.exec(markup)?.[1] ?? viewBox?.[1] ?? 0);
  const height = Number(/\bheight="([\d.]+)"/.exec(markup)?.[1] ?? viewBox?.[2] ?? 0);
  if (!(width > 0 && height > 0)) throw new Error("WaveDrom export SVG has invalid dimensions.");
  return { width, height };
}

function anchorPoint(annotation: Annotation, field: "anchor" | "start" | "end" | "from" | "to", document: CanonicalDocument, rowY: ReadonlyMap<SignalId, number>, start: number, cycleWidth: number): { x: number; y: number } | undefined {
  const anchor = annotation[field];
  if (!anchor) return undefined;
  const signalId = anchor.signalId ?? document.timeline.referenceClock;
  return { x: LABEL_WIDTH + (anchor.cycle - start) * cycleWidth + (anchor.offset?.x ?? 0), y: ((signalId ? rowY.get(signalId) : undefined) ?? 48) + (anchor.offset?.y ?? 0) };
}

export function buildExportScene(document: CanonicalDocument, settings: ExportSettings): ExportScene {
  const range = rangeFor(document, settings);
  const signals = document.signalGroups.flatMap((group) => group.rows.map((id) => document.signals.find((signal) => signal.id === id))).filter((signal): signal is Signal => signal !== undefined && signal.display.visible !== false);
  const lanes = [...new Set(document.transactions.map((transaction) => transaction.laneId ?? "lane_0"))].sort();
  const transactionTop = 52;
  const waveTop = transactionTop + lanes.length * TRANSACTION_HEIGHT + 34;
  const renderedWaves = signals.filter((signal) => signal.type !== "commentRow").map((signal, index) => {
    const waveJson = toWaveJson({ signal, cycleCount: document.timeline.cycleCount });
    const svgMarkup = renderWaveJsonMarkup(waveJson, index);
    return { signal, waveJson, svgMarkup, ...svgDimensions(svgMarkup) };
  });
  const cycleWidth = (renderedWaves[0]?.width ?? document.timeline.cycleCount * 20) / document.timeline.cycleCount;
  const rowHeight = Math.max(ROW_HEIGHT, (renderedWaves[0]?.height ?? 30) + 4);
  const rowY = new Map(signals.map((signal, index) => [signal.id, waveTop + index * rowHeight + rowHeight / 2]));
  const waveforms = renderedWaves.map(({ signal, waveJson, svgMarkup, width: sourceWidth, height: sourceHeight }): ExportWave => ({ signalId: signal.id, name: signal.display.name, role: signal.role, y: rowY.get(signal.id)!, svgMarkup, sourceWidth, sourceHeight, cropX: range.start * cycleWidth, width: (range.end - range.start) * cycleWidth, waveJson: JSON.stringify(waveJson) }));
  const labels: ExportLabel[] = signals.map((signal) => ({ text: signal.display.name, x: 12, y: rowY.get(signal.id)!, kind: "signal" }));
  const groupBands: ExportGroupBand[] = [];
  document.signalGroups.forEach((group) => { const ys = group.rows.map((id) => rowY.get(id as SignalId)).filter((y): y is number => y !== undefined); const first = ys[0]; if (first !== undefined) { labels.push({ text: group.name, x: 12, y: first - rowHeight / 2 - 4, kind: "group" }); groupBands.push({ id: group.id, name: group.name, y: first - rowHeight / 2, height: Math.max(rowHeight, (ys.at(-1)! - first) + rowHeight) }); } });
  const transactions = document.transactions.filter((transaction) => transaction.end > range.start && transaction.start < range.end).map((transaction): ExportTransaction => {
    const laneId = transaction.laneId ?? "lane_0";
    const x = LABEL_WIDTH + (Math.max(range.start, transaction.start) - range.start) * cycleWidth;
    return { id: transaction.id, name: transaction.name, laneId, x, y: transactionTop + lanes.indexOf(laneId) * TRANSACTION_HEIGHT, width: (Math.min(range.end, transaction.end) - Math.max(range.start, transaction.start)) * cycleWidth, linkedSignals: transaction.linkedSignals ?? [] };
  });
  const annotations = document.annotations.map((annotation): ExportAnnotation | undefined => {
    const first = anchorPoint(annotation, annotation.anchor ? "anchor" : annotation.start ? "start" : "from", document, rowY, range.start, cycleWidth);
    const second = anchorPoint(annotation, annotation.end ? "end" : annotation.to ? "to" : annotation.anchor ? "anchor" : "from", document, rowY, range.start, cycleWidth);
    return first && second ? { id: annotation.id, type: annotation.type, label: annotation.label, x1: first.x, y1: first.y, x2: second.x, y2: second.y } : undefined;
  }).filter((annotation): annotation is ExportAnnotation => annotation !== undefined);
  const width = LABEL_WIDTH + (range.end - range.start) * cycleWidth + 24;
  const height = waveTop + signals.length * rowHeight + 54;
  const legend = document.legend.show ? [...new Set(signals.map((signal) => signal.role))].sort() : [];
  return Object.freeze({ width, height, waveforms, labels, annotations, transactions, groupBands, legend, ruler: { start: range.start, end: range.end, x: LABEL_WIDTH, cycleWidth } });
}

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderExportSvg(scene: ExportScene): string {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" data-export-scene="v2" data-wave-engine="wavedrom-${WAVEDROM_VERSION}">`, `<rect width="100%" height="100%" fill="white"/>`];
  out.push(`<g data-layer="ruler" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#334155" stroke="#d5dde7">`);
  for (let cycle = scene.ruler.start; cycle <= scene.ruler.end; cycle += 1) { const x = scene.ruler.x + (cycle - scene.ruler.start) * scene.ruler.cycleWidth; out.push(`<line x1="${x}" y1="32" x2="${x}" y2="${scene.height - 24}"/><text x="${x + 3}" y="24" stroke="none">${cycle}</text>`); }
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
  for (const annotation of scene.annotations) out.push(`<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="${xml(annotation.type)}"><line x1="${annotation.x1}" y1="${annotation.y1}" x2="${annotation.x2}" y2="${annotation.y2}"/><text x="${Math.min(annotation.x1, annotation.x2) + 4}" y="${Math.min(annotation.y1, annotation.y2) - 5}" fill="#991b1b" stroke="none">${xml(annotation.label)}</text></g>`);
  out.push(`</g><g data-layer="legend" font-family="Segoe UI,Arial,sans-serif" font-size="10">${scene.legend.map((role, index) => `<text x="${12 + index * 80}" y="${scene.height - 12}">${xml(role)}</text>`).join("")}</g></svg>`);
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
