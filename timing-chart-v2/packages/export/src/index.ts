import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { allocateMeasurementLanes } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping, calculateRowLayout, remapValueChangesToDisplay, resolveSourcePosition, type DisplayTimeMapping } from "@timing-chart-v2/projection";
import { ANNOTATION_LABEL_LINE_HEIGHT, ANNOTATION_LABEL_MAX_WIDTH, MAX_MEASUREMENT_LANE, anchorTransitionFraction, anchorTransitionKind, effectiveLegendEntries, resolveEdgeCounterMarker, valueSignalWaveDomain, wrapAnnotationLabel, type Annotation, type CanonicalDocument, type ClockSignal, type JsonObject, type MeasurementProfile, type MeasurementLayout, type Signal, type SignalId, type ValueSignal } from "@timing-chart-v2/schema";
import { renderWaveJsonMarkup, toWaveJson, toWaveJsonMappedClock, toWaveJsonWindow, WaveDromAdapterError, WAVEDROM_VERSION, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";

export interface ExportSettings {
  readonly format: "svg" | "png" | "pdf";
  readonly scope: "document" | "selected-range";
  readonly range?: Readonly<{ start: number; end: number }>;
  readonly scale?: number;
  readonly page?: Readonly<{ size: "A4" | "Letter" | "wide"; orientation: "portrait" | "landscape"; margin: number; fit: "width" | "page" }>;
  readonly foldPolicy?: "respect" | "expand";
  /** Signal Split is an editor arrangement by default; opt in to preserving it in export. */
  readonly signalLayout?: "merged" | "preserve-split";
}

export interface ExportRequest {
  readonly format: "svg" | "png" | "pdf";
  readonly snapshot: CanonicalSnapshot;
  readonly settings?: Omit<ExportSettings, "format">;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress) => void;
}

export type ExportProgressStage = "preparing" | "drawing" | "encoding" | "rasterizing" | "finalizing";
export interface ExportProgress { readonly stage: ExportProgressStage }

export interface ExportWave { readonly signalId: SignalId; readonly name: string; readonly role: string; readonly y: number; readonly svgMarkup: string; readonly sourceWidth: number; readonly sourceHeight: number; readonly cropX: number; readonly width: number; readonly waveJson: string }
export interface ExportLabel { readonly text: string; readonly x: number; readonly y: number; readonly kind: "signal" | "comment" | "group" | "annotation" | "transaction" }
export interface ExportPoint { readonly x: number; readonly y: number }
export interface ExportAnnotation { readonly id: string; readonly type: string; readonly label: string; readonly x1: number; readonly x2: number; readonly y1: number; readonly y2: number; readonly opacity?: number; readonly sourceSignalId?: SignalId; readonly traceOffsetCycles?: number; readonly threshold1?: number; readonly threshold2?: number; readonly transitionKind1?: "threshold" | "ratio"; readonly transitionKind2?: "threshold" | "ratio"; readonly measurementProfile?: MeasurementProfile; readonly measurementLayout?: MeasurementLayout; readonly measurementLane?: number; readonly tracePoints?: readonly ExportPoint[]; readonly lineType?: "straight" | "orthogonal" | "curve" | "diagonal"; readonly arrowhead?: "end" | "start" | "bidirectional" | "none"; readonly labelOffsetX?: number; readonly labelOffsetY?: number; readonly labelPlacement?: "start" | "center" | "end" | "above" | "below"; readonly color?: string; readonly style?: JsonObject }
export interface ExportTransaction { readonly id: string; readonly name: string; readonly laneId: string; readonly x: number; readonly y: number; readonly width: number; readonly linkedSignals: readonly SignalId[] }
export interface ExportGroupBand { readonly id: string; readonly name: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fill: string; readonly fillOpacity: number; readonly stroke: string; readonly scope: "label" | "waveform" | "both"; readonly showHeader: boolean }
export interface ExportAxisBreak { readonly id: string; readonly name: string; readonly sourceStart: number; readonly sourceEnd: number; readonly x: number }
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
  readonly axisBreaks: readonly ExportAxisBreak[];
  readonly edgeCounters: readonly ExportEdgeCounter[];
  readonly legend: readonly string[];
  readonly legendPosition: Readonly<{ readonly x: number; readonly y: number }>;
  readonly legendOrientation: "horizontal" | "vertical";
  readonly ruler: ExportRuler;
  readonly documentLayout: ExportDocumentLayout;
  readonly page?: ExportPageLayout;
}

export interface ExportService { export(request: ExportRequest): Promise<Uint8Array> }

const LABEL_WIDTH = 220;
const ROW_HEIGHT = 34;
const TRANSACTION_HEIGHT = 28;
const HEADER_LINE_LIMIT = 112;
// #200 combined two-pane export: the visual gap between the stacked
// Upper and Lower blocks, matching the Editor's own signal-split-pane
// CSS divider proportions closely enough for a static export.

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
  return resolveSourcePosition(mapping, sourceCycle, bias) ?? (bias === "floor" ? 0 : mapping.displayCycleCount);
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

function valueChangesForWindow(signal: ValueSignal, start: number, end: number): ValueSignal["values"] {
  let low = 0;
  let high = signal.values.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (signal.values[middle]!.start <= start) low = middle + 1;
    else high = middle;
  }
  const active = low > 0 ? signal.values[low - 1] : undefined;
  const changes: ValueSignal["values"][number][] = active === undefined
    ? []
    : [{ start: 0, value: active.value, ...(active.displayLabel === undefined ? {} : { displayLabel: active.displayLabel }) }];
  for (let index = low; index < signal.values.length; index += 1) {
    const change = signal.values[index]!;
    if (change.start >= end) break;
    changes.push({ start: change.start - start, value: change.value, ...(change.displayLabel === undefined ? {} : { displayLabel: change.displayLabel }) });
  }
  return changes;
}

function sourceBoundaryForDisplay(mapping: DisplayTimeMapping, displayCycle: number): number {
  let low = 0;
  let high = mapping.sourceCycleCount + 1;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (mapping.displayBoundaryAtOrAfterSource(middle) < displayCycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Remap only source changes which can affect a selected display window. The
 * predecessor carries the value into the window; changes hidden in a fold
 * immediately before the visible resume boundary are retained so the last
 * hidden value wins exactly as it does in a full remap. */
function remapValueChangesToDisplayWindow(values: ValueSignal["values"], mapping: DisplayTimeMapping, start: number, end: number): ValueSignal["values"] {
  const sourceStart = sourceBoundaryForDisplay(mapping, start);
  const sourceEnd = sourceBoundaryForDisplay(mapping, end);
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (values[middle]!.start < sourceStart) low = middle + 1;
    else high = middle;
  }
  const carried = low > 0 ? values[low - 1] : undefined;
  const changes: ValueSignal["values"][number][] = [];
  let lastValue: ValueSignal["values"][number]["value"] | undefined = carried?.value;
  let pending: ValueSignal["values"][number] | undefined;
  let pendingDisplay = -1;
  const emit = () => {
    if (pending && pending.value !== lastValue) changes.push({ ...pending, start: pendingDisplay });
    if (pending) lastValue = pending.value;
    pending = undefined;
  };
  for (let index = low; index < values.length; index += 1) {
    const change = values[index]!;
    if (change.start >= sourceEnd) break;
    const display = mapping.displayBoundaryAtOrAfterSource(change.start);
    if (display >= end) break;
    if (display !== pendingDisplay) {
      if (pendingDisplay >= 0) emit();
      pendingDisplay = display;
    }
    pending = change;
  }
  if (pendingDisplay >= 0) emit();
  if (carried && changes[0]?.start !== start) changes.unshift({ ...carried, start });
  return changes;
}

function boundedWaveJson(signal: Exclude<Signal, { readonly type: "commentRow" }>, cycleCount: number, range: Readonly<{ start: number; end: number }>, enumDefinitions: CanonicalDocument["enumDefinitions"]): Readonly<{ waveJson: WaveJsonSignal; semanticValues: readonly string[]; windowStart: number; renderedCycleCount: number }> | undefined {
  if (signal.type === "clock") {
    const period = signal.generator.period;
    if (!Number.isInteger(period) || period < 1) return undefined;
    const windowStart = Math.floor(range.start / period) * period;
    const windowEnd = Math.min(Math.ceil(range.end / period) * period, cycleCount);
    if (windowEnd <= windowStart) return undefined;
    const waveJson = toWaveJsonWindow({ signal, cycleCount, enumDefinitions }, windowStart, windowEnd);
    // WaveDrom expands the final partial slot to its full period. Keep the
    // rendered cycle width aligned with that artifact while cropping to the
    // real document range below.
    const renderedCycleCount = Math.ceil((windowEnd - windowStart) / period) * period;
    return { waveJson, semanticValues: [], windowStart, renderedCycleCount };
  }
  const windowLength = range.end - range.start;
  const localSignal = { ...signal, values: valueChangesForWindow(signal, range.start, range.end) };
  const waveJson = toWaveJson({ signal: localSignal, cycleCount: windowLength, enumDefinitions });
  const semanticValues = valueSignalWaveDomain(signal.type) === "data" ? localSignal.values.map((change) => String(change.value)) : [];
  return { waveJson, semanticValues, windowStart: range.start, renderedCycleCount: windowLength };
}

/** Map a selected display interval into period-phase-preserving source spans.
 * A range may cross folds when every visible span retains the same periodic
 * phase; otherwise Clock export stays on the full-display path. */
interface FoldedClockSegment {
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

function foldedClockSourceSegments(mapping: DisplayTimeMapping, range: Readonly<{ start: number; end: number }>, period: number): readonly FoldedClockSegment[] | undefined {
  if (mapping.isIdentity || !Number.isInteger(period) || period < 1 || range.start < 0 || range.end > mapping.displayCycleCount || range.end <= range.start) return undefined;
  // WaveDrom's intrinsic width padding changes the exported cycle pitch for
  // very short artifacts. Conservatively keep windows under five cycles on
  // the full path, unless the document itself is shorter.
  if (range.end - range.start < Math.min(5, mapping.displayCycleCount)) return undefined;
  const firstSource = mapping.displayToSource(range.start);
  if (firstSource === undefined || (firstSource - range.start) % period !== 0) return undefined;
  const segments: FoldedClockSegment[] = [];
  let segmentDisplayStart = range.start;
  let segmentSourceStart = firstSource;
  let previousSource = firstSource;
  for (let display = range.start + 1; display < range.end; display += 1) {
    const source = mapping.displayToSource(display);
    if (source === undefined || (source - display) % period !== 0 || source <= previousSource) return undefined;
    if (source !== previousSource + 1) {
      segments.push({ displayStart: segmentDisplayStart, displayEnd: display, sourceStart: segmentSourceStart, sourceEnd: previousSource + 1 });
      segmentDisplayStart = display;
      segmentSourceStart = source;
    }
    previousSource = source;
  }
  segments.push({ displayStart: segmentDisplayStart, displayEnd: range.end, sourceStart: segmentSourceStart, sourceEnd: previousSource + 1 });
  if (segments.some((segment) => segment.displayEnd - segment.displayStart !== segment.sourceEnd - segment.sourceStart)) return undefined;
  return segments;
}

function boundedFoldedClockWaveJson(signal: ClockSignal, mapping: DisplayTimeMapping, range: Readonly<{ start: number; end: number }>): Readonly<{ waveJson: WaveJsonSignal; semanticValues: readonly string[]; windowStart: number; renderedCycleCount: number }> | undefined {
  const period = signal.generator.period;
  const generator = signal.generator;
  if (generator.duty !== 0.5 || !Number.isInteger(period) || period < 1 || !Number.isInteger(generator.start) || generator.start % period !== 0 || !Number.isInteger(generator.phase * 2) || range.end - range.start < Math.min(5, mapping.displayCycleCount)) return undefined;
  const windowStart = Math.floor(range.start / period) * period;
  const windowEnd = Math.ceil(range.end / period) * period;
  if (windowEnd > mapping.displayCycleCount) return undefined;
  const segments = foldedClockSourceSegments(mapping, { start: windowStart, end: windowEnd }, period);
  if (!segments || segments.length === 0 || segments.some((segment) =>
    segment.displayStart % period !== 0 || segment.displayEnd % period !== 0 || segment.sourceStart % period !== 0 || segment.sourceEnd % period !== 0
  )) return undefined;

  const wave: string[] = [];
  const enable = signal.enable ?? [];
  let low = 0;
  let high = enable.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (enable[middle]!.start <= segments[0]!.sourceStart) low = middle + 1;
    else high = middle;
  }
  let enableIndex = low;
  let activeEnableIndex = enableIndex - 1;
  let previousEnableStart = activeEnableIndex >= 0 ? enable[activeEnableIndex]!.start : -1;
  const suppressed = new Set(signal.generator.suppressedPeriods ?? []);
  const clockToken = signal.generator.polarity === "positive" ? "p" : "n";
  const staticToken = String(signal.generator.initial);
  let previous: string | undefined;
  for (const segment of segments) {
    for (let displayCycle = segment.displayStart; displayCycle < segment.displayEnd; displayCycle += period) {
      const sourceCycle = segment.sourceStart + (displayCycle - segment.displayStart);
      while (enableIndex < enable.length && enable[enableIndex]!.start <= sourceCycle) {
        const change = enable[enableIndex]!;
        if (!Number.isInteger(change.start) || change.start < 0 || change.start >= mapping.sourceCycleCount || change.start <= previousEnableStart || change.start % period !== 0) return undefined;
        previousEnableStart = change.start;
        activeEnableIndex = enableIndex;
        enableIndex += 1;
      }
      const rawEnable = activeEnableIndex < 0 ? 1 : enable[activeEnableIndex]!.value;
      const normalizedEnable = String(rawEnable).toLowerCase();
      const enabled = ["1", "true", "high"].includes(normalizedEnable);
      if (!enabled && !["0", "false", "low"].includes(normalizedEnable)) return undefined;
      // Generator start and suppressedPeriods are canonical source-cycle
      // semantics. A folded display cycle can have a different ordinal even
      // when its source/display offset preserves the waveform period phase.
      const pulseSlot = sourceCycle < signal.generator.start ? -1 : Math.round((sourceCycle - signal.generator.start) / period);
      const active = sourceCycle >= signal.generator.start && enabled && !suppressed.has(pulseSlot);
      const token = active ? clockToken : staticToken;
      wave.push(token === previous ? "." : token);
      previous = token;
    }
  }
  const firstSegment = segments[0]!;
  const lastSegment = segments[segments.length - 1]!;
  return {
    waveJson: {
      wave: wave.join(""),
      ...(period === 1 ? {} : { period }),
      ...(signal.generator.phase === 0 ? {} : { phase: signal.generator.phase }),
      ...(segments.length === 1 ? { sourceWindow: { start: firstSegment.sourceStart, end: lastSegment.sourceEnd } } : {}),
      displayWindow: { start: windowStart, end: windowEnd },
    },
    semanticValues: [],
    windowStart,
    renderedCycleCount: windowEnd - windowStart,
  };
}

/** General selected-range fallback for folded Clocks whose folds do not preserve
 * the period phase required by the compact periodic representation above. */
function boundedMappedFoldedClockWaveJson(signal: ClockSignal, mapping: DisplayTimeMapping, range: Readonly<{ start: number; end: number }>, enumDefinitions: CanonicalDocument["enumDefinitions"]): Readonly<{ waveJson: WaveJsonSignal; semanticValues: readonly string[]; windowStart: number; renderedCycleCount: number }> | undefined {
  // Keep WaveDrom's intrinsic-width behavior for tiny windows; this path is
  // for avoiding document-sized work on substantive selected ranges.
  if (mapping.isIdentity || range.start < 0 || range.end > mapping.displayCycleCount || range.end - range.start < Math.min(5, mapping.displayCycleCount)) return undefined;
  const sourceCycles: number[] = [];
  for (let displayCycle = range.start; displayCycle < range.end; displayCycle += 1) {
    const sourceCycle = mapping.displayToSource(displayCycle);
    if (sourceCycle === undefined) return undefined;
    sourceCycles.push(sourceCycle);
  }
  try {
    const waveJson = toWaveJsonMappedClock({ signal, cycleCount: mapping.sourceCycleCount, enumDefinitions }, sourceCycles);
    return { waveJson: { ...waveJson, displayWindow: range }, semanticValues: [], windowStart: range.start, renderedCycleCount: range.end - range.start };
  } catch (error) {
    if (error instanceof WaveDromAdapterError) return undefined;
    throw error;
  }
}

interface GhostTraceWindow {
  readonly traceStart: number;
  readonly traceEnd: number;
  readonly sampleStart: number;
  readonly sampleEnd: number;
}

function ghostTraceWindow(annotation: Annotation, cycleCount: number, range: Readonly<{ start: number; end: number }>): GhostTraceWindow | undefined {
  if (annotation.type !== "ghostTrace") return undefined;
  const firstAnchor = annotation.anchor ?? annotation.start ?? annotation.from;
  const lastAnchor = annotation.anchor ?? annotation.end ?? annotation.to ?? firstAnchor;
  if (!firstAnchor || !lastAnchor) return undefined;
  const offset = annotation.traceOffsetCycles ?? 0;
  const traceStart = Math.max(0, Math.floor(Math.min(firstAnchor.cycle, lastAnchor.cycle)), Math.ceil(range.start - offset));
  const traceEnd = Math.min(cycleCount, Math.ceil(Math.max(firstAnchor.cycle, lastAnchor.cycle)), Math.floor(range.end - offset));
  if (traceEnd < traceStart) return undefined;
  const firstSample = traceStart + offset;
  const lastSample = traceEnd + offset;
  if (lastSample < 0 || firstSample > cycleCount) return undefined;
  const sampleStart = Math.max(0, Math.floor(firstSample));
  const sampleEnd = Math.min(cycleCount, Math.floor(Math.min(cycleCount, lastSample)) + 1);
  // The trace samples an endpoint at cycleCount using the final rendered slot.
  // Keep that sample representable by the last non-empty source interval.
  return { traceStart, traceEnd, sampleStart: Math.min(sampleStart, Math.max(0, cycleCount - 1)), sampleEnd: Math.max(sampleEnd, Math.min(cycleCount, sampleStart + 1)) };
}

function foldedGhostTraceWindow(annotation: Annotation, mapping: DisplayTimeMapping, range: Readonly<{ start: number; end: number }>): Pick<GhostTraceWindow, "traceStart" | "traceEnd"> | undefined {
  if (annotation.type !== "ghostTrace") return undefined;
  const firstAnchor = annotation.anchor ?? annotation.start ?? annotation.from;
  const lastAnchor = annotation.anchor ?? annotation.end ?? annotation.to ?? firstAnchor;
  if (!firstAnchor || !lastAnchor) return undefined;

  const offset = annotation.traceOffsetCycles ?? 0;
  const sourceStart = mapping.displayToSource(range.start) ?? 0;
  // Include the right-hand boundary: Ghost Trace samples are inclusive, and
  // source positions in a fold immediately after that slot map to its display
  // cycle via floor semantics. The next display boundary is the exclusive
  // source limit; at the document end, also retain the terminal sample.
  const sourceEndExclusive = range.end >= mapping.displayCycleCount
    ? mapping.sourceCycleCount + 1
    : mapping.displayToSource(range.end + 1) ?? mapping.sourceCycleCount;
  const anchorStart = Math.max(0, Math.floor(Math.min(firstAnchor.cycle, lastAnchor.cycle)));
  const anchorEnd = Math.min(mapping.sourceCycleCount, Math.ceil(Math.max(firstAnchor.cycle, lastAnchor.cycle)));
  const traceStart = Math.max(anchorStart, Math.ceil(sourceStart - offset));
  const traceEnd = Math.min(anchorEnd, Math.ceil(sourceEndExclusive - offset) - 1);
  return traceEnd < traceStart ? undefined : { traceStart, traceEnd };
}

function mergeCycleRange(current: Readonly<{ start: number; end: number }> | undefined, next: Readonly<{ start: number; end: number }>): Readonly<{ start: number; end: number }> {
  return current === undefined ? next : { start: Math.min(current.start, next.start), end: Math.max(current.end, next.end) };
}

function anchorPoint(annotation: Annotation, field: "anchor" | "start" | "end" | "from" | "to", document: CanonicalDocument, rowY: ReadonlyMap<SignalId, number>, mapping: DisplayTimeMapping, start: number, cycleWidth: number): { x: number; y: number } | undefined {
  const anchor = annotation[field];
  if (!anchor) return undefined;
  const signalId = anchor.signalId ?? document.timeline.referenceClock;
  const displayCycle = toDisplayCycle(mapping, anchor.cycle, "floor");
  const fraction = anchorTransitionFraction(anchor);
  // Semantic cycle points resolve to the same boundary the live geometry map reports: start = 0, center = 1/2, end = 1 cycle.
  const cyclePointOffset = anchor.point === "cycle-center" ? 0.5 : anchor.point === "cycle-end" ? 1 : 0;
  const thresholdOffset = fraction === undefined ? cyclePointOffset : Math.max(0, Math.min(1, fraction));
  return { x: LABEL_WIDTH + (displayCycle + thresholdOffset) * cycleWidth - start * cycleWidth + (anchor.offset?.x ?? 0), y: ((signalId ? rowY.get(signalId) : undefined) ?? 48) + (anchor.offset?.y ?? 0) };
}

function toDisplayPosition(mapping: DisplayTimeMapping, sourceCycle: number): number {
  return resolveSourcePosition(mapping, sourceCycle, "omit") ?? resolveSourcePosition(mapping, sourceCycle, "floor") ?? resolveSourcePosition(mapping, sourceCycle, "ceil") ?? mapping.displayCycleCount;
}

/** #858: effective semantic token per wave slot, computed in one forward pass (was a backwards walk over `.`/`|` runs per sampled cycle). */
function effectiveWaveTokens(wave: string): readonly string[] {
  const tokens: string[] = [];
  let current = wave[0] ?? "0";
  for (let index = 0; index < wave.length; index += 1) {
    const token = wave[index]!;
    if (token !== "." && token !== "|") current = token;
    tokens.push(current);
  }
  return tokens;
}

function countPeriodicPoints(start: number, period: number, low: number, high: number): number {
  if (!(high > low)) return 0;
  const first = Math.max(0, Math.ceil((low - start) / period));
  const end = Math.max(0, Math.ceil((high - start) / period));
  return Math.max(0, end - first);
}

function firstValueChangeAfter(changes: readonly ValueSignal["values"][number][], cycle: number): number {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (changes[middle]!.start <= cycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

function simpleClockEdgeIndexBefore(signal: ClockSignal, cycleCount: number, mode: ClockSignal["edgeCounter"]["mode"], countFrom: number, edgeCycle: number): number {
  const { generator } = signal;
  const pulseStart = Math.max(0, generator.start + generator.phase);
  const oppositeOffset = generator.period * generator.duty;
  const primaryKind = generator.polarity === "positive" ? "rising" : "falling";
  const primarySelected = mode === "both" || mode === primaryKind;
  const oppositeSelected = mode === "both" || mode !== primaryKind;
  const lower = Math.max(pulseStart, countFrom);
  let count = primarySelected ? countPeriodicPoints(pulseStart, generator.period, lower, edgeCycle) : 0;
  if (oppositeSelected) {
    count += countPeriodicPoints(pulseStart, generator.period, Math.max(pulseStart, countFrom - oppositeOffset), Math.min(edgeCycle - oppositeOffset, cycleCount - oppositeOffset));
  }
  return count;
}

function clockEnabledAtValue(value: string | number): boolean {
  return ["1", "true", "high"].includes(String(value).toLowerCase());
}

function traceYForWaveToken(token: string, row: number, height: number): number {
  const low = Math.max(1, Math.min(height - 1, 20));
  const high = Math.max(0, Math.min(height - 1, 0));
  if (token === "1" || token === "p") return row - height / 2 + high;
  if (token === "0" || token === "n") return row - height / 2 + low;
  return row - height / 2 + (high + low) / 2;
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

function* buildExportSceneSteps(document: CanonicalDocument, settings: ExportSettings): Generator<void, ExportScene, void> {
  let itemsSinceYield = 0;
  const checkpoint = (): boolean => {
    itemsSinceYield += 1;
    if (itemsSinceYield < 64) return false;
    itemsSinceYield = 0;
    return true;
  };
  for (const annotation of document.annotations) {
    const lane = annotation.type === "measurement" ? annotation.measurementLayout?.lane : undefined;
    if (lane !== undefined && (!Number.isInteger(lane) || lane < 0 || lane > MAX_MEASUREMENT_LANE)) throw new RangeError(`Measurement '${annotation.id}' lane must be an integer from 0 to ${MAX_MEASUREMENT_LANE}.`);
    if (checkpoint()) yield;
  }
  const documentLayout = buildDocumentLayout(document);
  const headerHeight = 38 + documentLayout.headerLines.length * 14;
  const mapping = buildDisplayTimeMapping(document.timeline, settings.foldPolicy === "expand" ? [] : document.timeGroups);
  const range = rangeFor(document, settings, mapping);
  const signalById = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const signals = document.signalGroups.flatMap((group) => group.rows.map((id) => signalById.get(id))).filter((signal): signal is Signal => signal !== undefined && signal.display.visible !== false);
  const waveSignals = signals.filter((signal): signal is Exclude<Signal, { readonly type: "commentRow" }> => signal.type !== "commentRow");
  const lanes = [...new Set(document.transactions.map((transaction) => transaction.laneId ?? "lane_0"))].sort();
  const laneIndex = new Map(lanes.map((lane, index) => [lane, index] as const));
  const transactionTop = headerHeight + 14;
  const waveTop = transactionTop + lanes.length * TRANSACTION_HEIGHT + 34;
  const canBoundWaveforms = settings.scope === "selected-range";
  const canBoundSourceWaveforms = canBoundWaveforms && mapping.isIdentity;
  const waveformRanges = new Map<SignalId, Readonly<{ start: number; end: number }>>();
  if (canBoundSourceWaveforms) {
    for (const signal of waveSignals) waveformRanges.set(signal.id, range);
  }
  const ghostSourceSignalIds = new Set<SignalId>();
  for (const annotation of document.annotations) {
    if (annotation.type === "ghostTrace" && annotation.sourceSignalId) ghostSourceSignalIds.add(annotation.sourceSignalId);
    if (canBoundSourceWaveforms) {
      const traceWindow = ghostTraceWindow(annotation, document.timeline.cycleCount, range);
      if (traceWindow && annotation.sourceSignalId && waveformRanges.has(annotation.sourceSignalId)) {
        waveformRanges.set(annotation.sourceSignalId, mergeCycleRange(waveformRanges.get(annotation.sourceSignalId), { start: traceWindow.sampleStart, end: traceWindow.sampleEnd }));
      }
    }
    if (checkpoint()) yield;
  }
  const renderedWaves: Array<{ signal: Exclude<Signal, { readonly type: "commentRow" }>; waveJson: WaveJsonSignal; svgMarkup: string; windowStart: number; renderedCycleCount: number; width: number; height: number }> = [];
  for (const [index, signal] of waveSignals.entries()) {
    const boundedRange = waveformRanges.get(signal.id);
    const canBoundFoldedValues = canBoundWaveforms && !mapping.isIdentity && signal.type !== "clock";
    const displayValues = signal.type === "clock" || (canBoundSourceWaveforms && boundedRange !== undefined)
      ? undefined
      : canBoundFoldedValues
        ? remapValueChangesToDisplayWindow(signal.values, mapping, range.start, range.end)
        : remapValueChangesToDisplay(signal.values, mapping);
    const foldedClockBounded = canBoundWaveforms && !mapping.isIdentity && signal.type === "clock"
      ? boundedFoldedClockWaveJson(signal, mapping, range) ?? boundedMappedFoldedClockWaveJson(signal, mapping, range, document.enumDefinitions)
      : undefined;
    const displaySignal = signal.type === "clock"
      ? { ...signal, ...(signal.enable && foldedClockBounded === undefined ? { enable: remapValueChangesToDisplay(signal.enable, mapping) } : {}) }
      : { ...signal, values: displayValues ?? signal.values };
    const boundedRaw = canBoundWaveforms && (mapping.isIdentity || signal.type !== "clock")
      ? boundedWaveJson(mapping.isIdentity ? signal : displaySignal, mapping.isIdentity ? document.timeline.cycleCount : mapping.displayCycleCount, boundedRange ?? range, document.enumDefinitions)
      : undefined;
    const bounded = foldedClockBounded ?? boundedRaw;
    const waveJson = bounded?.waveJson ?? toWaveJson({ signal: displaySignal, cycleCount: mapping.displayCycleCount, enumDefinitions: document.enumDefinitions });
    const semanticValues = bounded?.semanticValues ?? (signal.type !== "clock" && valueSignalWaveDomain(signal.type) === "data" ? displayValues!.map((change) => String(change.value)) : undefined);
    const svgMarkup = renderWaveJsonMarkup(waveJson, index, semanticValues);
    renderedWaves.push({ signal, waveJson, svgMarkup, windowStart: bounded?.windowStart ?? 0, renderedCycleCount: bounded?.renderedCycleCount ?? mapping.displayCycleCount, ...svgDimensions(svgMarkup) });
    // This checkpoint is free in the synchronous builder and lets the browser
    // export path yield between complete per-Signal WaveDrom materializations.
    yield;
  }
  const cycleWidth = (renderedWaves[0]?.width ?? mapping.displayCycleCount * 20) / (renderedWaves[0]?.renderedCycleCount ?? mapping.displayCycleCount);
  const rowHeight = Math.max(ROW_HEIGHT, (renderedWaves[0]?.height ?? 30) + 4);
  const rowLayout = calculateRowLayout(document, new Set(), { includeHidden: false });
  const totalRowHeight = rowLayout.totalHeight;
  const rowEntries = new Map(rowLayout.navigationRows.map((entry) => [entry.rowId, entry]));
  const rowY = new Map(signals.map((signal, index) => {
    const entry = rowEntries.get(signal.id);
    return [signal.id, waveTop + (entry?.y ?? index * rowHeight) + (entry?.height ?? rowHeight) / 2] as const;
  }));
  const wavePositions = waveSignals.map((signal) => ({ signal, y: rowY.get(signal.id)! }));
  const renderedWaveById = new Map(renderedWaves.map((rendered) => [rendered.signal.id, rendered]));
  const waveforms: ExportWave[] = wavePositions.map(({ signal, y }): ExportWave => {
    const rendered = renderedWaveById.get(signal.id)!;
    return { signalId: signal.id, name: signal.display.name, role: signal.role, y, svgMarkup: rendered.svgMarkup, sourceWidth: rendered.width, sourceHeight: rendered.height, cropX: (range.start - rendered.windowStart) * cycleWidth, width: (range.end - range.start) * cycleWidth, waveJson: JSON.stringify(rendered.waveJson) };
  });
  const edgeCounters: ExportEdgeCounter[] = [];
  for (const { signal } of renderedWaves) {
    if (signal.type !== "clock" || !signal.edgeCounter.show) continue;
    const period = signal.generator.period;
    const start = Math.max(0, signal.generator.start + signal.generator.phase);
    const oppositeOffset = period * signal.generator.duty;
    const suppressed = new Set(signal.generator.suppressedPeriods ?? []);
    const marker = resolveEdgeCounterMarker(document, signal.edgeCounter);
    const countFromDisplay = signal.edgeCounter.countFrom === "visible-range-start" || signal.edgeCounter.countFrom === "selected-edge" ? range.start
      : signal.edgeCounter.countFrom === "marker" ? (marker === undefined ? Number.POSITIVE_INFINITY : toDisplayPosition(mapping, marker.start))
        : Number.NEGATIVE_INFINITY;
    const simplePeriodicEdges = settings.scope === "selected-range" && (signal.enable?.length ?? 0) === 0 && suppressed.size === 0 && signal.generator.duty > 0 && signal.generator.duty < 1;
    // A signal-start counter's ordinal is source-time periodic and can be
    // calculated directly even when the selected display range follows folds.
    // Other folded origins require their own source-boundary policy.
    const simpleBoundedEdges = simplePeriodicEdges && (mapping.isIdentity || signal.edgeCounter.countFrom === "signal-start");
    // Range-relative counters can enumerate enabled/suppressed clocks locally:
    // their labels start at the requested range (or an in-range marker), so no
    // pre-window edges are needed to preserve the counter ordinal.
    const rangeLocalCountOrigin = Number.isFinite(countFromDisplay) && countFromDisplay >= range.start;
    const rangeLocalEdges = settings.scope === "selected-range" && rangeLocalCountOrigin && signal.generator.duty > 0 && signal.generator.duty < 1;
    const canBoundEdges = simpleBoundedEdges || rangeLocalEdges;
    const activeKind: "rising" | "falling" = signal.generator.polarity === "positive" ? "rising" : "falling";
    const oppositeKind: "rising" | "falling" = activeKind === "rising" ? "falling" : "rising";
    const selected: Array<{ kind: "rising" | "falling"; cycle: number; ordinal: number }> = [];
    if (canBoundEdges) {
      const sourceRangeStart = mapping.isIdentity ? range.start : mapping.displayToSource(range.start) ?? 0;
      const sourceRangeEnd = mapping.isIdentity ? range.end : mapping.displayToSource(range.end) ?? document.timeline.cycleCount;
      const candidateStart = Math.max(start, sourceRangeStart - oppositeOffset, mapping.isIdentity && rangeLocalCountOrigin ? countFromDisplay - oppositeOffset : start);
      const firstCandidate = Math.max(0, Math.ceil((candidateStart - start) / period));
      const changes = signal.enable ?? [];
      const firstCycle = start + firstCandidate * period;
      let enableIndex = firstValueChangeAfter(changes, firstCycle);
      let enabled: string | number = enableIndex === 0 ? 1 : changes[enableIndex - 1]!.value;
      let localOrdinal = 0;
      for (let cycle = start + firstCandidate * period; cycle < Math.min(document.timeline.cycleCount, sourceRangeEnd); cycle += period) {
        if (checkpoint()) yield;
        while (enableIndex < changes.length && changes[enableIndex]!.start <= cycle) {
          enabled = changes[enableIndex]!.value;
          enableIndex += 1;
        }
        const slot = Math.round((cycle - signal.generator.start) / period);
        if (!clockEnabledAtValue(enabled) || suppressed.has(slot)) continue;
        const candidates: Array<{ kind: "rising" | "falling"; cycle: number }> = [];
        if (signal.edgeCounter.mode === "both" || signal.edgeCounter.mode === activeKind) candidates.push({ kind: activeKind, cycle });
        if (signal.edgeCounter.mode === "both" || signal.edgeCounter.mode === oppositeKind) candidates.push({ kind: oppositeKind, cycle: cycle + oppositeOffset });
        for (const edge of candidates) {
          const displayCycle = toDisplayPosition(mapping, edge.cycle);
          if (displayCycle < countFromDisplay || displayCycle < range.start || displayCycle >= range.end || edge.cycle >= document.timeline.cycleCount) continue;
          const ordinal = simpleBoundedEdges
            ? simpleClockEdgeIndexBefore(signal, document.timeline.cycleCount, signal.edgeCounter.mode, countFromDisplay, edge.cycle)
            : localOrdinal++;
          selected.push({ ...edge, ordinal });
        }
      }
    } else {
      const edges: Array<{ kind: "rising" | "falling"; cycle: number }> = [];
      const changes = signal.enable ?? [];
      let enableIndex = 0;
      let enabled: string | number = 1;
      for (let cycle = start; cycle < document.timeline.cycleCount; cycle += period) {
        if (checkpoint()) yield;
        while (enableIndex < changes.length && changes[enableIndex]!.start <= cycle) {
          enabled = changes[enableIndex]!.value;
          enableIndex += 1;
        }
        const slot = Math.round((cycle - signal.generator.start) / period);
        if (!clockEnabledAtValue(enabled) || suppressed.has(slot)) continue;
        edges.push({ kind: activeKind, cycle });
        if (cycle + oppositeOffset < document.timeline.cycleCount) edges.push({ kind: oppositeKind, cycle: cycle + oppositeOffset });
      }
      edges.filter((edge) => signal.edgeCounter.mode === "both" || signal.edgeCounter.mode === edge.kind)
        .sort((left, right) => left.cycle - right.cycle || left.kind.localeCompare(right.kind))
        .filter((edge) => toDisplayPosition(mapping, edge.cycle) >= countFromDisplay)
        .forEach((edge, ordinal) => selected.push({ ...edge, ordinal }));
    }
    selected.sort((left, right) => left.cycle - right.cycle || left.kind.localeCompare(right.kind));
    selected.forEach((edge) => {
      const index = edge.ordinal;
      if (index % Math.max(1, signal.edgeCounter.labelEvery) !== 0) return;
      const displayCycle = toDisplayPosition(mapping, edge.cycle);
      if (!canBoundEdges && (displayCycle < range.start || displayCycle >= range.end)) return;
      const row = rowY.get(signal.id) ?? waveTop;
      edgeCounters.push({ id: `edge:${signal.id}:${edge.kind}:${edge.cycle}`, signalId: signal.id, kind: edge.kind, cycle: edge.cycle, x: LABEL_WIDTH + (displayCycle - range.start) * cycleWidth + signal.edgeCounter.offset.x, y: row + signal.edgeCounter.offset.y + (signal.edgeCounter.position === "above" ? -6 : 10), label: String(signal.edgeCounter.startNumber + index) });
    });
  }
  const labels: ExportLabel[] = [
    // Wave-signal name labels duplicate per pane occurrence exactly like
    // their waveform (a "both"-assigned Signal's name appears once above
    // each of its two rendered waves). Comment Rows are never split-pane
    // aware (see the scope note above wavePositions) and keep their
    // single, pre-split position.
    ...wavePositions.map(({ signal, y }): ExportLabel => ({ text: signal.display.name, x: 12, y, kind: "signal" })),
    ...signals.filter((signal) => signal.type === "commentRow").map((signal): ExportLabel => ({ text: signal.display.name, x: 12, y: rowY.get(signal.id)!, kind: "signal" })),
  ];
  for (const signal of signals) {
    if (signal.type !== "commentRow") continue;
    labels.push({ text: signal.body || signal.title || signal.display.name, x: LABEL_WIDTH, y: rowY.get(signal.id)!, kind: "comment" });
  }
  const contentWidth = LABEL_WIDTH + (range.end - range.start) * cycleWidth + 24;
  const groupBands: ExportGroupBand[] = [];
  document.signalGroups.forEach((group) => {
    const entries = group.rows.map((id) => rowEntries.get(id)).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
    const first = entries[0];
    const last = entries.at(-1);
    if (!first || !last) return;
    const style = group.style;
    const scope = style?.extend ?? "both";
    const showHeader = style?.showHeader !== false;
    const showBackground = style?.showBackground !== false;
    if (showHeader) labels.push({ text: group.name, x: 12, y: waveTop + first.y - 4, kind: "group" });
    if (!showBackground) return;
    const x = scope === "label" ? 0 : scope === "waveform" ? LABEL_WIDTH : 0;
    const width = scope === "label" ? LABEL_WIDTH : scope === "waveform" ? contentWidth - LABEL_WIDTH : contentWidth;
    groupBands.push({
      id: group.id,
      name: group.name,
      x,
      y: waveTop + first.y,
      width,
      height: Math.max(rowHeight, last.y + last.height - first.y),
      fill: style?.background ?? "#f8fafc",
      fillOpacity: style?.opacity ?? 0.22,
      stroke: style?.border ?? "none",
      scope,
      showHeader,
    });
  });
  const axisBreaks: ExportAxisBreak[] = settings.foldPolicy === "expand" ? [] : document.timeGroups
    .filter((group) => group.presentation?.collapsed)
    .map((group): ExportAxisBreak => ({
      id: group.id,
      name: group.presentation?.foldLabel || group.name,
      sourceStart: group.start,
      sourceEnd: group.end,
      x: LABEL_WIDTH + (toDisplayCycle(mapping, group.start, "floor") - range.start) * cycleWidth,
    }))
    .filter((item) => item.x >= LABEL_WIDTH && item.x <= LABEL_WIDTH + (range.end - range.start) * cycleWidth);
  const transactions: ExportTransaction[] = [];
  for (const transaction of document.transactions) {
    const laneId = transaction.laneId ?? "lane_0";
    const displayStart = toDisplayCycle(mapping, transaction.start, "floor");
    const displayEnd = Math.max(displayStart + 1, toDisplayCycle(mapping, transaction.end, "ceil"));
    if (displayEnd > range.start && displayStart < range.end) {
      const x = LABEL_WIDTH + (Math.max(range.start, displayStart) - range.start) * cycleWidth;
      transactions.push({ id: transaction.id, name: transaction.name, laneId, x, y: transactionTop + laneIndex.get(laneId)! * TRANSACTION_HEIGHT, width: (Math.min(range.end, displayEnd) - Math.max(range.start, displayStart)) * cycleWidth, linkedSignals: transaction.linkedSignals ?? [] });
    }
    if (checkpoint()) yield;
  }
  const measurementSpans: Array<{ id: string; firstX: number; secondX: number; explicitLane?: number }> = [];
  for (const annotation of document.annotations) {
    if (annotation.type !== "measurement" || !annotation.start || !annotation.end) {
      if (checkpoint()) yield;
      continue;
    }
    const first = anchorPoint(annotation, "start", document, rowY, mapping, range.start, cycleWidth);
    const second = anchorPoint(annotation, "end", document, rowY, mapping, range.start, cycleWidth);
    if (first && second) measurementSpans.push({ id: annotation.id, firstX: first.x, secondX: second.x, ...(annotation.measurementLayout?.lane === undefined ? {} : { explicitLane: annotation.measurementLayout.lane }) });
    if (checkpoint()) yield;
  }
  const measurementLaneById = allocateMeasurementLanes(measurementSpans);
  const annotations: ExportAnnotation[] = [];
  const effectiveTraceTokensBySignalId = new Map<SignalId, readonly string[]>();
  for (const annotation of document.annotations) {
    const firstAnchor = annotation.anchor ?? annotation.start ?? annotation.from;
    const lastAnchor = annotation.anchor ?? annotation.end ?? annotation.to ?? firstAnchor;
    const first = anchorPoint(annotation, annotation.anchor ? "anchor" : annotation.start ? "start" : "from", document, rowY, mapping, range.start, cycleWidth);
    const second = anchorPoint(annotation, annotation.end ? "end" : annotation.to ? "to" : annotation.anchor ? "anchor" : "from", document, rowY, mapping, range.start, cycleWidth);
    if (!first || !second) {
      if (checkpoint()) yield;
      continue;
    }
    const sourceWave = annotation.type === "ghostTrace" && annotation.sourceSignalId ? renderedWaveById.get(annotation.sourceSignalId) : undefined;
    let tracePoints: readonly ExportPoint[] | undefined;
    if (sourceWave && firstAnchor && lastAnchor) {
      const offset = annotation.traceOffsetCycles ?? 0;
      // ghostTraceWindow's selected range is expressed in source-cycle space.
      // Under folds the ExportScene range is display-cycle space, so treating
      // those numbers as source cycles can truncate a trace that is visibly in
      // range. Folded exports keep the semantic anchor span and filter each
      // sample by its shared DisplayTimeMapping below.
      const boundedTraceWindow = canBoundWaveforms
        ? mapping.isIdentity
          ? ghostTraceWindow(annotation, document.timeline.cycleCount, range)
          : foldedGhostTraceWindow(annotation, mapping, range)
        : undefined;
      let startCycle = Math.max(0, Math.floor(Math.min(firstAnchor.cycle, lastAnchor.cycle)));
      let endCycle = Math.min(document.timeline.cycleCount, Math.ceil(Math.max(firstAnchor.cycle, lastAnchor.cycle)));
      if (boundedTraceWindow) {
        startCycle = Math.max(startCycle, boundedTraceWindow.traceStart);
        endCycle = Math.min(endCycle, boundedTraceWindow.traceEnd);
      }
      const points: ExportPoint[] = [];
      let traceTokens = effectiveTraceTokensBySignalId.get(sourceWave.signal.id);
      if (!traceTokens) {
        traceTokens = effectiveWaveTokens(sourceWave.waveJson.wave);
        effectiveTraceTokensBySignalId.set(sourceWave.signal.id, traceTokens);
      }
      const tracePeriod = Math.max(1, sourceWave.waveJson.period ?? 1);
      for (let cycle = startCycle; cycle <= endCycle; cycle += 1) {
        if (checkpoint()) yield;
        const sourceCycle = cycle + offset;
        if (sourceCycle >= 0 && sourceCycle <= document.timeline.cycleCount) {
          const displayCycle = toDisplayPosition(mapping, sourceCycle);
          if (displayCycle >= range.start && displayCycle <= range.end) {
            // WaveJSON slots are in the rendered display domain. For identity
            // windows this is also source time; for folded exports, using the
            // source cycle here reads the wrong slot after a collapsed interval.
            const localDisplayCycle = displayCycle - sourceWave.windowStart;
            const y = traceYForWaveToken((traceTokens[Math.max(0, Math.min(traceTokens.length - 1, Math.floor(localDisplayCycle / tracePeriod)))] ?? "0"), rowY.get(sourceWave.signal.id) ?? first.y, sourceWave.height);
            const point = { x: LABEL_WIDTH + (displayCycle - range.start) * cycleWidth, y };
            const previousPoint = points[points.length - 1];
            if (previousPoint?.x !== point.x || previousPoint.y !== point.y) points.push(point);
          }
        }
        // Every source sample inside one collapsed group resolves to the same
        // display boundary and WaveJSON slot, hence the same Ghost Trace point.
        // Skip the hidden source span in one step instead of walking up to the
        // entire fold length for a narrow selected-range export.
        const collapsedGroup = mapping.collapsedGroupAtSource(sourceCycle);
        if (collapsedGroup) cycle = Math.max(cycle, Math.ceil(collapsedGroup.end - offset) - 1);
      }
      tracePoints = points.length > 1 ? points : undefined;
    }
    const startFraction = anchorTransitionFraction(annotation.start);
    const endFraction = anchorTransitionFraction(annotation.end);
    const startKind = anchorTransitionKind(annotation.start);
    const endKind = anchorTransitionKind(annotation.end);
    annotations.push({ id: annotation.id, type: annotation.type, label: annotation.label, x1: first.x, y1: first.y, x2: second.x, y2: second.y, ...(annotation.opacity === undefined ? {} : { opacity: annotation.opacity }), ...(annotation.sourceSignalId === undefined ? {} : { sourceSignalId: annotation.sourceSignalId }), ...(annotation.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: annotation.traceOffsetCycles }), ...(startFraction === undefined ? {} : { threshold1: startFraction }), ...(endFraction === undefined ? {} : { threshold2: endFraction }), ...(startKind === undefined ? {} : { transitionKind1: startKind }), ...(endKind === undefined ? {} : { transitionKind2: endKind }), ...(annotation.measurement?.profile === undefined ? {} : { measurementProfile: annotation.measurement.profile }), ...(annotation.measurementLayout === undefined ? {} : { measurementLayout: annotation.measurementLayout, measurementLane: measurementLaneById.get(annotation.id) ?? annotation.measurementLayout.lane ?? 0 }), ...(tracePoints === undefined ? {} : { tracePoints }), ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }), ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }), ...(annotation.labelOffset === undefined ? {} : { labelOffsetX: annotation.labelOffset.x, labelOffsetY: annotation.labelOffset.y }), ...(annotation.labelPlacement === undefined ? {} : { labelPlacement: annotation.labelPlacement }), ...(annotation.color === undefined ? {} : { color: annotation.color }), ...(annotation.style === undefined ? {} : { style: annotation.style }) });
    if (checkpoint()) yield;
  }
  const contentHeight = waveTop + totalRowHeight + 54 + (documentLayout.footerText || documentLayout.figureNumber || documentLayout.revision ? 18 : 0);
  const legend = document.legend.show ? effectiveLegendEntries(document).map((entry) => entry.label) : [];
  const ticks: ExportRulerTick[] = [];
  for (let cycle = range.start; cycle <= range.end; cycle += 1) {
    ticks.push({ cycle, text: String(mapping.labelFor(cycle)) });
    if (checkpoint()) yield;
  }
  const page = settings.page ? pageLayout(settings.page, contentWidth, contentHeight) : undefined;
  return Object.freeze({ width: page?.width ?? contentWidth, height: page?.height ?? contentHeight, waveforms, labels, annotations, transactions, groupBands, axisBreaks, edgeCounters, legend, legendPosition: document.legend.position, legendOrientation: document.legend.orientation, ruler: { start: range.start, end: range.end, x: LABEL_WIDTH, cycleWidth, ticks }, documentLayout, ...(page === undefined ? {} : { page }) });
}

/** Synchronous deterministic scene API retained for pure callers and tests. */
export function buildExportScene(document: CanonicalDocument, settings: ExportSettings): ExportScene {
  const steps = buildExportSceneSteps(document, settings);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

function throwIfExportAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Export canceled.");
  error.name = "AbortError";
  throw error;
}

async function yieldExportTask(signal?: AbortSignal): Promise<void> {
  throwIfExportAborted(signal);
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === "function") { await scheduler.yield(); throwIfExportAborted(signal); return; }
  if (typeof globalThis.MessageChannel === "function") {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
      channel.port2.postMessage(undefined);
    });
    throwIfExportAborted(signal);
    return;
  }
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  throwIfExportAborted(signal);
}

async function buildExportSceneCooperatively(document: CanonicalDocument, settings: ExportSettings, signal?: AbortSignal, onProgress?: ExportRequest["onProgress"]): Promise<ExportScene> {
  const steps = buildExportSceneSteps(document, settings);
  let sliceStartedAt = globalThis.performance?.now() ?? Date.now();
  while (true) {
    throwIfExportAborted(signal);
    const step = steps.next();
    if (step.done) return step.value;
    const now = globalThis.performance?.now() ?? Date.now();
    if (now - sliceStartedAt >= 16) {
      onProgress?.({ stage: "preparing" });
      await yieldExportTask(signal);
      sliceStartedAt = globalThis.performance?.now() ?? Date.now();
    }
  }
}

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** #377: an SVG `<text>` element ignores embedded "\n" -- browsers render
 * every line of text content on one baseline regardless of literal
 * newlines. One `<tspan>` per line (each re-anchored to the same `x`, the
 * first at `y`, each subsequent one shifted down a fixed line height) is
 * the standard SVG multi-line idiom, matching the live-DOM renderer's own
 * `white-space: pre-wrap` <span> for the same "\n"-separated label text. */
function multilineText(x: number, y: number, label: string, attrs: string, style?: JsonObject): string {
  const wrap = style?.labelWrap !== false;
  const width = typeof style?.labelMaxWidth === "number" && style.labelMaxWidth >= ANNOTATION_LABEL_MAX_WIDTH.min && style.labelMaxWidth <= ANNOTATION_LABEL_MAX_WIDTH.max ? style.labelMaxWidth : ANNOTATION_LABEL_MAX_WIDTH.default;
  const fontSize = typeof style?.fontSize === "number" && style.fontSize > 0 ? style.fontSize : 10;
  const lines = (wrap ? wrapAnnotationLabel(label, width, fontSize) : label).split("\n");
  if (lines.length === 1) return `<text x="${x}" y="${y}" ${attrs}>${xml(label)}</text>`;
  const authoredLineHeight = typeof style?.lineHeight === "number" && Number.isFinite(style.lineHeight) && style.lineHeight >= ANNOTATION_LABEL_LINE_HEIGHT.min && style.lineHeight <= ANNOTATION_LABEL_LINE_HEIGHT.max ? style.lineHeight : undefined;
  const lineHeight = authoredLineHeight === undefined ? 13 : fontSize * authoredLineHeight;
  return `<text x="${x}" y="${y}" ${attrs}>${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
}

function placedLabelPosition(annotation: ExportAnnotation, first = { x: annotation.x1, y: annotation.y1 }, second = { x: annotation.x2, y: annotation.y2 }): { readonly x: number; readonly y: number } | undefined {
  if (!annotation.labelPlacement) return undefined;
  const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const point = annotation.labelPlacement === "start" ? first
    : annotation.labelPlacement === "end" ? second
    : center;
  const y = annotation.labelPlacement === "above" ? center.y - 14
    : annotation.labelPlacement === "below" ? center.y + 14
    : point.y;
  return { x: point.x + (annotation.labelOffsetX ?? 0), y: y + (annotation.labelOffsetY ?? -14) };
}

/** #378: Stroke (independent width/style) and Fill (independent color/
 * opacity) for the CSS-border/background-driven shapes -- same permissive
 * parse-from-a-free-form-style-object convention, and the same field names,
 * as the live-DOM renderer's own `parsePresentationStyle`
 * (packages/renderer/src/stable-surface.ts), so a document's authored
 * Stroke/Fill produces the same visual result in both places. Deliberately
 * duplicated rather than shared, matching this package's existing
 * ExportScene/ExportAnnotation architecture (packages/export has no
 * dependency on packages/renderer). */
function parsePresentationStyle(style: JsonObject | undefined): { readonly strokeWidth?: number; readonly strokeDash?: string; readonly fillColor?: string; readonly fillOpacity?: number } {
  const source = style ?? {};
  const strokeWidth = typeof source.strokeWidth === "number" && source.strokeWidth >= 1 && source.strokeWidth <= 8 ? source.strokeWidth : undefined;
  const strokeStyle = source.strokeStyle === "solid" || source.strokeStyle === "dashed" || source.strokeStyle === "dotted" ? source.strokeStyle : undefined;
  const strokeDash = strokeStyle === "dashed" ? "7 4" : strokeStyle === "dotted" ? "2 3" : undefined;
  const fillColor = typeof source.fillColor === "string" && (source.fillColor === "none" || /^#[0-9a-f]{3,8}$/i.test(source.fillColor)) ? source.fillColor : undefined;
  const fillOpacity = typeof source.fillOpacity === "number" && source.fillOpacity >= 0 && source.fillOpacity <= 1 ? source.fillOpacity : undefined;
  return { ...(strokeWidth === undefined ? {} : { strokeWidth }), ...(strokeDash === undefined ? {} : { strokeDash }), ...(fillColor === undefined ? {} : { fillColor }), ...(fillOpacity === undefined ? {} : { fillOpacity }) };
}

/** #378: Range/Highlight/Rectangle/Ellipse are all the renderer's "range"
 * overlay shape -- a full-surface-height band from the earlier of its two
 * semantic anchors to the later, NOT a row-height box (see
 * packages/renderer/src/stable-surface.ts's `primitive.shape === "range"`
 * branch: `translate(x, 0px)` + `height: ${surfaceHeight}px`, identical for
 * all four types; only their border-style/radius CSS differs). Before this,
 * they fell through to the generic point/line fallback, which drew a bare,
 * usually near-zero-length `<line>` with no fill and no border at all: a
 * real, silent export gap, not merely an unstyled one. */
function renderAreaAnnotationSvg(annotation: ExportAnnotation, metadata: string, surfaceHeight: number): string {
  const presentation = parsePresentationStyle(annotation.style);
  const color = annotation.color ?? "#d04a36";
  const x = Math.min(annotation.x1, annotation.x2);
  const width = Math.max(2, Math.abs(annotation.x2 - annotation.x1));
  const fill = presentation.fillColor === "none" ? "none" : presentation.fillColor ?? color;
  const fillOpacity = presentation.fillColor === "none" ? 0 : presentation.fillOpacity ?? (annotation.type === "highlight" ? 0.32 : 0.12);
  const strokeWidth = presentation.strokeWidth ?? 1;
  // Matches each type's current CSS default exactly when no Stroke override
  // is authored: highlight is dashed, ellipse a rounded pill (border-radius:
  // 50%), range/rectangle a plain solid-bordered box.
  const strokeDasharray = presentation.strokeDash ?? (annotation.type === "highlight" ? "4 3" : undefined);
  const rx = annotation.type === "ellipse" ? Math.min(width, surfaceHeight) / 2 : 2;
  // Label position matches the live-DOM renderer's own placement (the
  // resolved anchor row's Y, offset by authored labelOffset -- default
  // -14px), NOT the top of the full-height band this shape now spans.
  const placed = placedLabelPosition(annotation);
  const labelX = placed?.x ?? x + (annotation.labelOffsetX ?? 4);
  const labelY = placed?.y ?? (annotation.y1 + annotation.y2) / 2 + (annotation.labelOffsetY ?? -14);
  return `<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="${xml(annotation.type)}"${metadata}><rect x="${x}" y="0" width="${width}" height="${surfaceHeight}" rx="${rx}" fill="${xml(fill)}" fill-opacity="${fillOpacity}" stroke="${xml(color)}" stroke-width="${strokeWidth}"${strokeDasharray ? ` stroke-dasharray="${strokeDasharray}"` : ""}/>${multilineText(labelX, labelY, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`;
}

/** #378: Vertical Line's live-DOM glyph is a full-height dashed vertical
 * line at the single semantic anchor (center-columns.css's
 * `[data-annotation-shape="vertical"] [data-role="annotation-body"]`) --
 * like Marker/Bracket before #377 fixed them, it fell through to the
 * generic point/line fallback, which for a point-type annotation
 * (x1===x2, y1===y2) draws an invisible zero-length line. */
function renderVerticalLineSvg(annotation: ExportAnnotation, metadata: string, surfaceHeight: number): string {
  const presentation = parsePresentationStyle(annotation.style);
  const color = annotation.color ?? "#d04a36";
  const strokeWidth = presentation.strokeWidth ?? 2;
  const strokeDasharray = presentation.strokeDash ?? "5 3";
  const placed = placedLabelPosition(annotation, { x: annotation.x1, y: annotation.y1 }, { x: annotation.x1, y: annotation.y1 });
  const labelX = placed?.x ?? annotation.x1 + (annotation.labelOffsetX ?? 6);
  const labelY = placed?.y ?? annotation.y1 + (annotation.labelOffsetY ?? -14);
  return `<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="verticalLine"${metadata}><line x1="${annotation.x1}" y1="0" x2="${annotation.x1}" y2="${surfaceHeight}" stroke="${xml(color)}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}"/>${multilineText(labelX, labelY, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`;
}

function renderMeasurementSvg(annotation: ExportAnnotation, metadata: string): string {
  const layout = annotation.measurementLayout;
  if (!layout || annotation.measurementLane === undefined) { const placed = placedLabelPosition(annotation); return `<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="measurement"${metadata}><line x1="${annotation.x1}" y1="${annotation.y1}" x2="${annotation.x2}" y2="${annotation.y2}"/>${multilineText(placed?.x ?? Math.min(annotation.x1, annotation.x2) + 4, placed?.y ?? Math.min(annotation.y1, annotation.y2) - 5, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`; }
  const y = Math.min(annotation.y1, annotation.y2) - 18 * (annotation.measurementLane + 1);
  const extension = (side: "start" | "end", x: number, anchorY: number) => layout.extensionLines === "both" || layout.extensionLines === side ? `<line data-role="measurement-extension" data-extension-side="${side}" x1="${x}" y1="${anchorY}" x2="${x}" y2="${y}" stroke-dasharray="3 2"/>` : "";
  const marker = (side: "start" | "end", x: number, kind: "none" | "bar" | "arrow") => {
    if (kind === "none") return "";
    if (kind === "bar") return `<line data-role="measurement-marker" data-marker-side="${side}" data-marker-kind="bar" x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke-width="2"/>`;
    const inward = layout.arrowLayout === "inward";
    const points = side === "start"
      ? (inward ? `${x - 7},${y - 4} ${x},${y} ${x - 7},${y + 4}` : `${x + 7},${y - 4} ${x},${y} ${x + 7},${y + 4}`)
      : (inward ? `${x + 7},${y - 4} ${x},${y} ${x + 7},${y + 4}` : `${x - 7},${y - 4} ${x},${y} ${x - 7},${y + 4}`);
    return `<polyline data-role="measurement-marker" data-marker-side="${side}" data-marker-kind="arrow" points="${points}" fill="none" stroke-width="1.5"/>`;
  };
  const placed = placedLabelPosition(annotation, { x: annotation.x1, y }, { x: annotation.x2, y });
  return `<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="measurement" data-measurement-lane="${annotation.measurementLane}" data-arrow-layout="${layout.arrowLayout}"${metadata}>${extension("start", annotation.x1, annotation.y1)}${extension("end", annotation.x2, annotation.y2)}${marker("start", annotation.x1, layout.startMarker)}${marker("end", annotation.x2, layout.endMarker)}<line data-role="measurement-dimension-line" x1="${annotation.x1}" y1="${y}" x2="${annotation.x2}" y2="${y}"/>${multilineText(placed?.x ?? (annotation.x1 + annotation.x2) / 2 + 4, placed?.y ?? y - 5, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`;
}

/** #375: Arrow/Dependency's real route shape (straight/orthogonal/curve/
 * diagonal) and arrow markers (none/start/end/both), matching the live-DOM
 * rendering in packages/renderer/src/stable-surface.ts's linePath()/marker
 * construction -- ported rather than shared, since a DOM-mounted SVG and a
 * standalone exported document build their markup through genuinely
 * different mechanisms. Diagonal reuses the straight segment (same
 * reasoning as the live renderer: distinguishable via dash pattern, not a
 * second coordinate system) with a dashed stroke. */
function linePathForExport(lineType: NonNullable<ExportAnnotation["lineType"]>, x1: number, y1: number, x2: number, y2: number): { readonly d: string; readonly dash?: string } {
  if (lineType === "orthogonal") {
    const bendX = (x1 + x2) / 2;
    return { d: `M ${x1} ${y1} L ${bendX} ${y1} L ${bendX} ${y2} L ${x2} ${y2}` };
  }
  if (lineType === "curve") {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.max(1, Math.hypot(dx, dy));
    const offset = Math.max(14, length * 0.24);
    const normal = { x: (-dy / length) * offset, y: (dx / length) * offset };
    const controlX = (x1 + x2) / 2 + normal.x;
    const controlY = (y1 + y2) / 2 + normal.y;
    return { d: `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}` };
  }
  if (lineType === "diagonal") {
    // #375: matches the live-DOM renderer's own 45-degree-elbow geometry
    // (packages/renderer/src/stable-surface.ts's `linePath`) -- genuinely
    // distinct from Straight's single direct segment, not merely a
    // different stroke pattern on the same path.
    const dx = x2 - x1;
    const dy = y2 - y1;
    const run = Math.min(Math.abs(dx), Math.abs(dy));
    const bendX = x1 + Math.sign(dx || 1) * run;
    const bendY = y1 + Math.sign(dy || 1) * run;
    return { d: `M ${x1} ${y1} L ${bendX} ${bendY} L ${x2} ${y2}`, dash: "7 4" };
  }
  return { d: `M ${x1} ${y1} L ${x2} ${y2}` };
}

function renderLineAnnotationSvg(annotation: ExportAnnotation, metadata: string): string {
  const lineType = annotation.lineType ?? "straight";
  const arrowhead = annotation.arrowhead ?? "none";
  const color = annotation.color ?? "#d04a36";
  const path = linePathForExport(lineType, annotation.x1, annotation.y1, annotation.x2, annotation.y2);
  const markerId = `export-arrow-${xml(annotation.id)}`;
  const markerDef = (suffix: "start" | "end", reverse: boolean) => `<marker id="${markerId}-${suffix}" markerWidth="8" markerHeight="8" refX="${reverse ? 1 : 7}" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="${reverse ? "M 8 0 L 0 4 L 8 8 Z" : "M 0 0 L 8 4 L 0 8 Z"}" fill="${xml(color)}"/></marker>`;
  const defs = [
    ...(arrowhead === "start" || arrowhead === "bidirectional" ? [markerDef("start", true)] : []),
    ...(arrowhead === "end" || arrowhead === "bidirectional" ? [markerDef("end", false)] : []),
  ];
  const markerAttrs = `${arrowhead === "start" || arrowhead === "bidirectional" ? ` marker-start="url(#${markerId}-start)"` : ""}${arrowhead === "end" || arrowhead === "bidirectional" ? ` marker-end="url(#${markerId}-end)"` : ""}`;
  const placed = placedLabelPosition(annotation);
  const labelX = placed?.x ?? Math.min(annotation.x1, annotation.x2) + 4 + (annotation.labelOffsetX ?? 0);
  const labelY = placed?.y ?? Math.min(annotation.y1, annotation.y2) - 5 + (annotation.labelOffsetY ?? 0);
  return `<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="${xml(annotation.type)}" data-line-type="${lineType}" data-arrowhead="${arrowhead}"${metadata}>${defs.length ? `<defs>${defs.join("")}</defs>` : ""}<path data-role="annotation-path" d="${path.d}" fill="none" stroke="${xml(color)}" stroke-width="2"${path.dash ? ` stroke-dasharray="${path.dash}"` : ""}${markerAttrs}/>${multilineText(labelX, labelY, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`;
}

function* renderExportSvgSteps(scene: ExportScene): Generator<void, readonly string[], void> {
  let serializedItemsSinceYield = 0;
  const checkpoint = (): boolean => {
    serializedItemsSinceYield += 1;
    if (serializedItemsSinceYield < 64) return false;
    serializedItemsSinceYield = 0;
    return true;
  };
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" data-export-scene="v2" data-wave-engine="wavedrom-${WAVEDROM_VERSION}">`, `<rect width="100%" height="100%" fill="white"/>`, ...(scene.page ? [`<g data-layer="page-content" transform="translate(${scene.page.contentOffsetX} ${scene.page.contentOffsetY}) scale(${scene.page.contentScale})">`] : [])];
  const layout = scene.documentLayout;
  out.push(`<g data-layer="document-layout" font-family="Segoe UI,Arial,sans-serif" fill="#1e293b"><text data-layout="title" x="12" y="20" font-size="16" font-weight="700">${xml(layout.title)}</text>`);
  for (const [index, line] of layout.headerLines.entries()) {
    out.push(`<text data-layout="header" x="12" y="${38 + index * 14}" font-size="10">${xml(line)}</text>`);
    if (checkpoint()) yield;
  }
  out.push(`</g>`);
  out.push(`<g data-layer="ruler" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#334155" stroke="#d5dde7">`);
  const rulerTop = 24 + 38 + layout.headerLines.length * 14;
  for (const tick of scene.ruler.ticks) { const x = scene.ruler.x + (tick.cycle - scene.ruler.start) * scene.ruler.cycleWidth; out.push(`<line x1="${x}" y1="${rulerTop}" x2="${x}" y2="${scene.height - 24}"/><text x="${x + 3}" y="${rulerTop - 8}" stroke="none">${xml(tick.text)}</text>`); if (checkpoint()) yield; }
  out.push(`</g><g data-layer="transactions" font-family="Segoe UI,Arial,sans-serif" font-size="11">`);
  for (const item of scene.transactions) { out.push(`<g data-transaction-id="${xml(item.id)}"><rect x="${item.x}" y="${item.y}" width="${item.width}" height="20" rx="4" fill="#dbeafe" stroke="#2563eb"/><text x="${item.x + 6}" y="${item.y + 14}">${xml(item.name)}</text></g>`); if (checkpoint()) yield; }
  out.push(`</g><g data-layer="group-bands">`);
  for (const band of scene.groupBands) { out.push(`<rect data-group-id="${xml(band.id)}" data-scope="${band.scope}" x="${band.x}" y="${band.y}" width="${band.width}" height="${band.height}" fill="${xml(band.fill)}" fill-opacity="${band.fillOpacity}" stroke="${xml(band.stroke)}"/>`); if (checkpoint()) yield; }
  out.push(`</g><g data-layer="axis-breaks" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#52677d" stroke="#52677d">`);
  for (const item of scene.axisBreaks) {
    out.push(`<g data-axis-break-id="${xml(item.id)}" data-source-start="${item.sourceStart}" data-source-end="${item.sourceEnd}"><path d="M${item.x - 4} 22 l4 8 l4 -8 M${item.x - 4} ${scene.height - 30} l4 8 l4 -8" fill="none" stroke-width="1.5"/><text x="${item.x + 8}" y="38" fill="#52677d" stroke="none">${xml(item.name)}</text></g>`);
    if (checkpoint()) yield;
  }
  out.push(`</g><g data-layer="labels" font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#1e293b">`);
  for (const label of scene.labels) { out.push(`<text data-label-kind="${label.kind}" x="${label.x}" y="${label.y + 4}"${label.kind === "comment" ? ` fill="#9144d3"` : ""}>${xml(label.text)}</text>`); if (checkpoint()) yield; }
  out.push(`</g><g data-layer="waveforms">`);
  for (const wave of scene.waveforms) {
    const inner = wave.svgMarkup.slice(wave.svgMarkup.indexOf(">") + 1, wave.svgMarkup.lastIndexOf("</svg>"));
    out.push(`<svg data-signal-id="${xml(wave.signalId)}" data-role="${xml(wave.role)}" data-wave-json="${xml(wave.waveJson)}" x="${scene.ruler.x}" y="${wave.y - wave.sourceHeight / 2}" width="${wave.width}" height="${wave.sourceHeight}" viewBox="${wave.cropX} 0 ${wave.width} ${wave.sourceHeight}" overflow="hidden" class="WaveDrom">${inner}</svg>`);
    if (checkpoint()) yield;
  }
  out.push(`</g><g data-layer="annotations" font-family="Segoe UI,Arial,sans-serif" font-size="11" stroke="#dc2626" fill="none">`);
  for (const annotation of scene.annotations) {
    const metadata = `${annotation.sourceSignalId ? ` data-source-signal-id="${xml(annotation.sourceSignalId)}"` : ""}${annotation.traceOffsetCycles === undefined ? "" : ` data-trace-offset-cycles="${annotation.traceOffsetCycles}"`}${annotation.threshold1 === undefined ? "" : ` data-start-threshold="${annotation.threshold1}"`}${annotation.threshold2 === undefined ? "" : ` data-end-threshold="${annotation.threshold2}"`}${annotation.transitionKind1 === undefined ? "" : ` data-start-transition-kind="${annotation.transitionKind1}"`}${annotation.transitionKind2 === undefined ? "" : ` data-end-transition-kind="${annotation.transitionKind2}"`}${annotation.measurementProfile === undefined ? "" : ` data-measurement-profile="${annotation.measurementProfile}"`}`;
    if (annotation.type === "timingRegion") out.push(`<rect data-annotation-id="${xml(annotation.id)}" data-annotation-type="timingRegion"${metadata} x="${Math.min(annotation.x1, annotation.x2)}" y="0" width="${Math.max(2, Math.abs(annotation.x2 - annotation.x1))}" height="${scene.height}" fill="${xml("#d04a36")}" fill-opacity="${annotation.opacity ?? 0.16}" stroke="none"/>`);
    else if (annotation.type === "ghostTrace") {
      const points = annotation.tracePoints?.map((point) => `${point.x},${point.y}`).join(" ");
      const path = points ? `<polyline data-role="ghost-trace-path" points="${points}"` : `<line x1="${annotation.x1}" y1="${annotation.y1}" x2="${annotation.x2}" y2="${annotation.y2}"`;
      const placed = placedLabelPosition(annotation);
      out.push(`<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="ghostTrace"${metadata}>${path} fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="6 4" opacity="${annotation.opacity ?? 0.55}"/>${multilineText(placed?.x ?? Math.min(annotation.x1, annotation.x2) + 4, placed?.y ?? Math.min(annotation.y1, annotation.y2) - 5, annotation.label, `fill="#475569" stroke="none"`, annotation.style)}</g>`);
    }
    else if (annotation.type === "measurement") out.push(renderMeasurementSvg(annotation, metadata));
    else if (annotation.type === "arrow" || annotation.type === "dependency" || annotation.type === "connector") out.push(renderLineAnnotationSvg(annotation, metadata));
    else if (annotation.type === "marker") {
      // #377: Marker's live-DOM glyph is a short vertical tick at the
      // semantic anchor (center-columns.css's `[data-annotation-type="marker"]
      // [data-role="annotation-body"]`, a 28px-tall border-left) -- distinct
      // from the Bookmark navigation object and from a zero-length line.
      const placed = placedLabelPosition(annotation, { x: annotation.x1, y: annotation.y1 }, { x: annotation.x1, y: annotation.y1 });
      out.push(`<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="marker"${metadata}><line data-role="marker-tick" x1="${annotation.x1}" y1="${annotation.y1 - 14}" x2="${annotation.x1}" y2="${annotation.y1 + 14}" stroke="#d04a36" stroke-width="3"/>${multilineText(placed?.x ?? annotation.x1 + 6, placed?.y ?? annotation.y1 + 4, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`);
    }
    else if (annotation.type === "bracket") {
      // #377: Bracket must read as a bracket, not a plain Range line --
      // matching the live-DOM renderer's own cap marks
      // (packages/renderer/src/stable-surface.ts's `primitive.type === "bracket"` branch).
      const dx = annotation.x2 - annotation.x1;
      const dy = annotation.y2 - annotation.y1;
      const length = Math.max(1, Math.hypot(dx, dy));
      const capX = (-dy / length) * 6;
      const capY = (dx / length) * 6;
      const placed = placedLabelPosition(annotation);
      out.push(`<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="bracket"${metadata}><line x1="${annotation.x1}" y1="${annotation.y1}" x2="${annotation.x2}" y2="${annotation.y2}"/><path data-role="annotation-bracket-caps" d="M ${annotation.x1 - capX} ${annotation.y1 - capY} L ${annotation.x1 + capX} ${annotation.y1 + capY} M ${annotation.x2 - capX} ${annotation.y2 - capY} L ${annotation.x2 + capX} ${annotation.y2 + capY}" fill="none" stroke="#d04a36" stroke-width="2"/>${multilineText(placed?.x ?? Math.min(annotation.x1, annotation.x2) + 4, placed?.y ?? Math.min(annotation.y1, annotation.y2) - 5, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`);
    }
    else if (annotation.type === "range" || annotation.type === "highlight" || annotation.type === "rectangle" || annotation.type === "ellipse") out.push(renderAreaAnnotationSvg(annotation, metadata, scene.height));
    else if (annotation.type === "verticalLine") out.push(renderVerticalLineSvg(annotation, metadata, scene.height));
    else { const placed = placedLabelPosition(annotation); out.push(`<g data-annotation-id="${xml(annotation.id)}" data-annotation-type="${xml(annotation.type)}"><line x1="${annotation.x1}" y1="${annotation.y1}" x2="${annotation.x2}" y2="${annotation.y2}"/>${multilineText(placed?.x ?? Math.min(annotation.x1, annotation.x2) + 4, placed?.y ?? Math.min(annotation.y1, annotation.y2) - 5, annotation.label, `fill="#991b1b" stroke="none"`, annotation.style)}</g>`); }
    if (checkpoint()) yield;
  }
  out.push(`</g><g data-layer="edge-counters" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#7c3aed" stroke="none">`);
  for (const edge of scene.edgeCounters) { out.push(`<text data-edge-counter-id="${xml(edge.id)}" data-signal-id="${xml(edge.signalId)}" data-edge-kind="${edge.kind}" data-cycle="${edge.cycle}" x="${edge.x}" y="${edge.y}">${xml(edge.label)}</text>`); if (checkpoint()) yield; }
  const footer = [layout.figureNumber, layout.revision, layout.footerText].filter((value) => value.length > 0).join(" · ");
  const legendItems: string[] = [];
  for (const [index, role] of scene.legend.entries()) { legendItems.push(`<text x="${scene.legendOrientation === "vertical" ? 12 : 12 + index * 80}" y="${12 + (scene.legendOrientation === "vertical" ? index * 14 : 0)}">${xml(role)}</text>`); if (checkpoint()) yield; }
  out.push(`</g><g data-layer="legend" data-orientation="${scene.legendOrientation}" transform="translate(${scene.legendPosition.x} ${scene.legendPosition.y})" font-family="Segoe UI,Arial,sans-serif" font-size="10">${legendItems.join("")}</g>`);
  if (footer) out.push(`<text data-layout="footer" x="12" y="${scene.height - 12}" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#52677d">${xml(footer)}</text>`);
  if (scene.page) out.push(`</g>`);
  out.push(`</svg>`);
  const chunks: string[] = [];
  let parts: string[] = [];
  let partCharacters = 0;
  for (const part of out) {
    parts.push(part);
    partCharacters += part.length;
    if (parts.length < 64 && partCharacters < 256 * 1024) continue;
    chunks.push(parts.join(""));
    parts = [];
    partCharacters = 0;
    yield;
  }
  if (parts.length > 0) chunks.push(parts.join(""));
  return chunks;
}

/** Synchronous deterministic SVG API retained for pure callers and tests. */
export function renderExportSvg(scene: ExportScene): string {
  const steps = renderExportSvgSteps(scene);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value.join("");
}

async function renderExportSvgChunksCooperatively(scene: ExportScene, signal?: AbortSignal, onProgress?: ExportRequest["onProgress"]): Promise<readonly string[]> {
  const steps = renderExportSvgSteps(scene);
  let sliceStartedAt = globalThis.performance?.now() ?? Date.now();
  while (true) {
    throwIfExportAborted(signal);
    const step = steps.next();
    if (step.done) return step.value;
    const now = globalThis.performance?.now() ?? Date.now();
    if (now - sliceStartedAt >= 16) {
      onProgress?.({ stage: "drawing" });
      await yieldExportTask(signal);
      sliceStartedAt = globalThis.performance?.now() ?? Date.now();
    }
  }
}

async function encodeSvgChunksCooperatively(chunks: readonly string[], signal?: AbortSignal, onProgress?: ExportRequest["onProgress"]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const encoded: Uint8Array[] = [];
  let totalBytes = 0;
  let sliceStartedAt = globalThis.performance?.now() ?? Date.now();
  for (const chunk of chunks) {
    throwIfExportAborted(signal);
    const bytes = encoder.encode(chunk);
    encoded.push(bytes);
    totalBytes += bytes.byteLength;
    const now = globalThis.performance?.now() ?? Date.now();
    if (now - sliceStartedAt >= 16) {
      onProgress?.({ stage: "encoding" });
      await yieldExportTask(signal);
      sliceStartedAt = globalThis.performance?.now() ?? Date.now();
    }
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const bytes of encoded) {
    throwIfExportAborted(signal);
    output.set(bytes, offset);
    offset += bytes.byteLength;
    const now = globalThis.performance?.now() ?? Date.now();
    if (now - sliceStartedAt >= 16) {
      onProgress?.({ stage: "encoding" });
      await yieldExportTask(signal);
      sliceStartedAt = globalThis.performance?.now() ?? Date.now();
    }
  }
  return output;
}

type SvgMarkupParts = string | readonly string[];

function svgMarkupBlobParts(svg: SvgMarkupParts): BlobPart[] {
  return typeof svg === "string" ? [svg] : [...svg];
}

export async function rasterizeSvgToPng(svg: SvgMarkupParts, width: number, height: number, scale = 1, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfExportAborted(signal);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export requires a 2D Canvas context.");
  context.scale(scale, scale); context.fillStyle = "white"; context.fillRect(0, 0, width, height);
  const url = URL.createObjectURL(new Blob(svgMarkupBlobParts(svg), { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    if (signal) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { image.src = ""; rejectExportAbort(reject); };
        signal.addEventListener("abort", abort, { once: true });
        image.decode().then(() => { signal.removeEventListener("abort", abort); resolve(); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
        if (signal.aborted) abort();
      });
    } else await image.decode();
    throwIfExportAborted(signal);
    context.drawImage(image, 0, 0, width, height);
  } finally { URL.revokeObjectURL(url); }
  throwIfExportAborted(signal);
  const png = await new Promise<Blob>((resolve, reject) => {
    const abort = () => rejectExportAbort(reject);
    signal?.addEventListener("abort", abort, { once: true });
    canvas.toBlob((value) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) { rejectExportAbort(reject); return; }
      if (value) resolve(value); else reject(new Error("PNG encoding failed."));
    }, "image/png");
    if (signal?.aborted) abort();
  });
  throwIfExportAborted(signal);
  return new Uint8Array(await png.arrayBuffer());
}

function rejectExportAbort(reject: (error: Error) => void): void {
  const error = new Error("Export canceled.");
  error.name = "AbortError";
  reject(error);
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

async function renderExportPdf(scene: ExportScene, svg: SvgMarkupParts, signal?: AbortSignal, onProgress?: ExportRequest["onProgress"]): Promise<Uint8Array> {
  if (typeof document === "undefined") return renderDeterministicNodePdf(scene, typeof svg === "string" ? svg : svg.join(""));
  onProgress?.({ stage: "rasterizing" });
  const png = await rasterizeSvgToPng(svg, scene.width, scene.height, 1, signal);
  throwIfExportAborted(signal);
  onProgress?.({ stage: "finalizing" });
  throwIfExportAborted(signal);
  const { PDFDocument } = await import("pdf-lib");
  throwIfExportAborted(signal);
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0)); pdf.setProducer("Timing Chart V2"); pdf.setCreator("Timing Chart V2");
  const page = pdf.addPage([scene.width, scene.height]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: scene.width, height: scene.height });
  const result = await pdf.save({ useObjectStreams: false, addDefaultPage: false });
  throwIfExportAborted(signal);
  return result;
}

export class DeterministicExportService implements ExportService {
  async export(request: ExportRequest): Promise<Uint8Array> {
    const settings: ExportSettings = { format: request.format, scope: request.settings?.scope ?? "document", ...request.settings };
    const report = (stage: ExportProgressStage) => { throwIfExportAborted(request.signal); request.onProgress?.({ stage }); };
    report("preparing");
    const scene = await buildExportSceneCooperatively(request.snapshot.document, settings, request.signal, request.onProgress);
    report("drawing");
    const svgChunks = await renderExportSvgChunksCooperatively(scene, request.signal, request.onProgress);
    if (request.format === "svg") {
      report("encoding");
      return encodeSvgChunksCooperatively(svgChunks, request.signal, request.onProgress);
    }
    if (request.format === "png") {
      report("rasterizing");
      return rasterizeSvgToPng(svgChunks, scene.width, scene.height, settings.scale ?? 1, request.signal);
    }
    return renderExportPdf(scene, svgChunks, request.signal, request.onProgress);
  }
}
