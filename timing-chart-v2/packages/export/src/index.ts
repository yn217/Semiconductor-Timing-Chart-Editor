import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { Annotation, CanonicalDocument, Signal, SignalId } from "@timing-chart-v2/schema";
import { toWaveJson } from "@timing-chart-v2/wavedrom-adapter";

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

export interface ExportWave { readonly signalId: SignalId; readonly name: string; readonly role: string; readonly y: number; readonly path: string; readonly waveJson: string }
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
const CYCLE_WIDTH = 40;
const ROW_HEIGHT = 34;
const TRANSACTION_HEIGHT = 28;

function rangeFor(document: CanonicalDocument, settings: ExportSettings): { start: number; end: number } {
  const requested = settings.scope === "selected-range" ? settings.range : undefined;
  if (!requested) return { start: 0, end: document.timeline.cycleCount };
  const start = Math.max(0, Math.min(document.timeline.cycleCount - 1, Math.trunc(requested.start)));
  const end = Math.max(start + 1, Math.min(document.timeline.cycleCount, Math.trunc(requested.end)));
  return { start, end };
}

function signalPath(signal: Signal, y: number, start: number, end: number): string {
  const high = y - 8;
  const low = y + 8;
  const point = (cycle: number) => LABEL_WIDTH + (cycle - start) * CYCLE_WIDTH;
  if (signal.type === "commentRow") return "";
  if (signal.type === "clock") {
    const segments: string[] = [`M ${point(start)} ${low}`];
    for (let cycle = start; cycle < end; cycle += 1) segments.push(`H ${point(cycle) + CYCLE_WIDTH / 2} V ${high} H ${point(cycle + 1)} V ${low}`);
    return segments.join(" ");
  }
  const changes = signal.values.filter((change) => change.start < end);
  const valueAt = (cycle: number) => changes.filter((change) => change.start <= cycle).at(-1)?.value;
  const level = (value: unknown) => value === 1 || value === "1" ? high : low;
  if (signal.type === "binary" || signal.type === "logic") {
    const segments: string[] = [`M ${point(start)} ${level(valueAt(start))}`];
    for (let cycle = start + 1; cycle <= end; cycle += 1) segments.push(`H ${point(cycle)}${cycle < end ? ` V ${level(valueAt(cycle))}` : ""}`);
    return segments.join(" ");
  }
  const segments: string[] = [];
  for (let cycle = start; cycle < end; cycle += 1) {
    const x1 = point(cycle), x2 = point(cycle + 1), bevel = Math.min(6, CYCLE_WIDTH / 4);
    segments.push(`M ${x1} ${y} L ${x1 + bevel} ${high} H ${x2 - bevel} L ${x2} ${y} L ${x2 - bevel} ${low} H ${x1 + bevel} Z`);
  }
  return segments.join(" ");
}

function anchorPoint(annotation: Annotation, field: "anchor" | "start" | "end" | "from" | "to", document: CanonicalDocument, rowY: ReadonlyMap<SignalId, number>, start: number): { x: number; y: number } | undefined {
  const anchor = annotation[field];
  if (!anchor) return undefined;
  const signalId = anchor.signalId ?? document.timeline.referenceClock;
  return { x: LABEL_WIDTH + (anchor.cycle - start) * CYCLE_WIDTH + (anchor.offset?.x ?? 0), y: (signalId ? rowY.get(signalId) : undefined) ?? 48 + (anchor.offset?.y ?? 0) };
}

export function buildExportScene(document: CanonicalDocument, settings: ExportSettings): ExportScene {
  const range = rangeFor(document, settings);
  const signals = document.signalGroups.flatMap((group) => group.rows.map((id) => document.signals.find((signal) => signal.id === id))).filter((signal): signal is Signal => signal !== undefined && signal.display.visible !== false);
  const lanes = [...new Set(document.transactions.map((transaction) => transaction.laneId ?? "lane_0"))].sort();
  const transactionTop = 52;
  const waveTop = transactionTop + lanes.length * TRANSACTION_HEIGHT + 34;
  const rowY = new Map(signals.map((signal, index) => [signal.id, waveTop + index * ROW_HEIGHT + ROW_HEIGHT / 2]));
  const waveforms = signals.filter((signal) => signal.type !== "commentRow").map((signal) => ({ signalId: signal.id, name: signal.display.name, role: signal.role, y: rowY.get(signal.id)!, path: signalPath(signal, rowY.get(signal.id)!, range.start, range.end), waveJson: JSON.stringify(toWaveJson({ signal, cycleCount: document.timeline.cycleCount })) }));
  const labels: ExportLabel[] = signals.map((signal) => ({ text: signal.display.name, x: 12, y: rowY.get(signal.id)!, kind: "signal" }));
  const groupBands: ExportGroupBand[] = [];
  document.signalGroups.forEach((group) => { const ys = group.rows.map((id) => rowY.get(id as SignalId)).filter((y): y is number => y !== undefined); const first = ys[0]; if (first !== undefined) { labels.push({ text: group.name, x: 12, y: first - ROW_HEIGHT / 2 - 4, kind: "group" }); groupBands.push({ id: group.id, name: group.name, y: first - ROW_HEIGHT / 2, height: Math.max(ROW_HEIGHT, (ys.at(-1)! - first) + ROW_HEIGHT) }); } });
  const transactions = document.transactions.filter((transaction) => transaction.end > range.start && transaction.start < range.end).map((transaction): ExportTransaction => {
    const laneId = transaction.laneId ?? "lane_0";
    const x = LABEL_WIDTH + (Math.max(range.start, transaction.start) - range.start) * CYCLE_WIDTH;
    return { id: transaction.id, name: transaction.name, laneId, x, y: transactionTop + lanes.indexOf(laneId) * TRANSACTION_HEIGHT, width: (Math.min(range.end, transaction.end) - Math.max(range.start, transaction.start)) * CYCLE_WIDTH, linkedSignals: transaction.linkedSignals ?? [] };
  });
  const annotations = document.annotations.map((annotation): ExportAnnotation | undefined => {
    const first = anchorPoint(annotation, annotation.anchor ? "anchor" : annotation.start ? "start" : "from", document, rowY, range.start);
    const second = anchorPoint(annotation, annotation.end ? "end" : annotation.to ? "to" : annotation.anchor ? "anchor" : "from", document, rowY, range.start);
    return first && second ? { id: annotation.id, type: annotation.type, label: annotation.label, x1: first.x, y1: first.y, x2: second.x, y2: second.y } : undefined;
  }).filter((annotation): annotation is ExportAnnotation => annotation !== undefined);
  const width = LABEL_WIDTH + (range.end - range.start) * CYCLE_WIDTH + 24;
  const height = waveTop + signals.length * ROW_HEIGHT + 54;
  const legend = document.legend.show ? [...new Set(signals.map((signal) => signal.role))].sort() : [];
  return Object.freeze({ width, height, waveforms, labels, annotations, transactions, groupBands, legend, ruler: { start: range.start, end: range.end, x: LABEL_WIDTH, cycleWidth: CYCLE_WIDTH } });
}

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderExportSvg(scene: ExportScene): string {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" data-export-scene="v2">`, `<rect width="100%" height="100%" fill="white"/>`];
  out.push(`<g data-layer="ruler" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#334155" stroke="#d5dde7">`);
  for (let cycle = scene.ruler.start; cycle <= scene.ruler.end; cycle += 1) { const x = scene.ruler.x + (cycle - scene.ruler.start) * scene.ruler.cycleWidth; out.push(`<line x1="${x}" y1="32" x2="${x}" y2="${scene.height - 24}"/><text x="${x + 3}" y="24" stroke="none">${cycle}</text>`); }
  out.push(`</g><g data-layer="transactions" font-family="Segoe UI,Arial,sans-serif" font-size="11">`);
  for (const item of scene.transactions) out.push(`<g data-transaction-id="${xml(item.id)}"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="20" rx="4" fill="#dbeafe" stroke="#2563eb"/><text x="${item.x + 6}" y="${item.y + 14}">${xml(item.name)}</text></g>`);
  out.push(`</g><g data-layer="group-bands">`);
  for (const band of scene.groupBands) out.push(`<rect data-group-id="${xml(band.id)}" x="0" y="${band.y}" width="${scene.width}" height="${band.height}" fill="#f8fafc" fill-opacity="0.22" stroke="#d8e0e9"/>`);
  out.push(`</g><g data-layer="labels" font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#1e293b">`);
  for (const label of scene.labels) out.push(`<text data-label-kind="${label.kind}" x="${label.x}" y="${label.y + 4}">${xml(label.text)}</text>`);
  out.push(`</g><g data-layer="waveforms" fill="none" stroke="#111827" stroke-width="1.25">`);
  for (const wave of scene.waveforms) out.push(`<path data-signal-id="${xml(wave.signalId)}" data-role="${xml(wave.role)}" data-wave-json="${xml(wave.waveJson)}" d="${wave.path}"/>`);
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
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const inherited = (element: Element, name: string, fallback: string) => { let owner: Element | null = element; while (owner) { const value = owner.getAttribute(name); if (value && value !== "none") return value; owner = owner.parentElement; } return fallback; };
  for (const element of root.querySelectorAll("line, rect, path, text")) {
    context.strokeStyle = inherited(element, "stroke", "#111827"); context.fillStyle = inherited(element, "fill", "transparent");
    context.lineWidth = Number(element.getAttribute("stroke-width") ?? 1);
    if (element.tagName === "line") { context.beginPath(); context.moveTo(Number(element.getAttribute("x1")), Number(element.getAttribute("y1"))); context.lineTo(Number(element.getAttribute("x2")), Number(element.getAttribute("y2"))); context.stroke(); }
    else if (element.tagName === "rect" && !element.getAttribute("width")?.includes("%")) { const x = Number(element.getAttribute("x")), y = Number(element.getAttribute("y")), w = Number(element.getAttribute("width")), h = Number(element.getAttribute("height")); if (context.fillStyle !== "transparent") context.fillRect(x, y, w, h); context.strokeRect(x, y, w, h); }
    else if (element.tagName === "path") { const path = new Path2D(element.getAttribute("d") ?? ""); if (context.fillStyle !== "transparent") context.fill(path); context.stroke(path); }
    else if (element.tagName === "text") { context.font = `${inherited(element, "font-size", "11")}px Segoe UI, Arial, sans-serif`; context.fillStyle = inherited(element, "fill", "#1e293b"); context.fillText(element.textContent ?? "", Number(element.getAttribute("x")), Number(element.getAttribute("y"))); }
  }
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed.")), "image/png"));
  return new Uint8Array(await png.arrayBuffer());
}

function renderExportPdf(scene: ExportScene, svg: string): Uint8Array {
  const safeSvg = svg.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 10 Tf 24 24 Td (Timing Chart V2 - ${scene.waveforms.length} signals, ${scene.transactions.length} transactions) Tj ET\n% Canonical SVG ${safeSvg}`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${scene.width} ${scene.height}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`, `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
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
