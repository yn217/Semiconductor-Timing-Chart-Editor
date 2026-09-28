import { DefaultScreenGeometryProjector, resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { createDisplayTimeViewport, DisplayTimeMappingCache, type DisplayTimeMapping, type DisplayTimeViewport, type RenderProjection } from "@timing-chart-v2/projection";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { displayBoundaryForSource } from "./display-boundary.js";
import { buildSnapIndex } from "./snap-index.js";

export const FULL_DOCUMENT_WAVEFORM_CYCLE_LIMIT = 4_096;
/** Avoid a single full-document artifact when cycle × signal work is high. */
export const FULL_DOCUMENT_WAVEFORM_SIGNAL_CYCLE_LIMIT = 32_768;
/** Target work bound for each mounted signal's WaveDrom source window. */
export const WAVEFORM_WINDOW_SIGNAL_CYCLE_BUDGET = 16_384;

export function usesFullDocumentWaveformWindow(cycleCount: number, signalCount = 1): boolean {
  return cycleCount <= FULL_DOCUMENT_WAVEFORM_CYCLE_LIMIT
    && cycleCount * Math.max(1, signalCount) <= FULL_DOCUMENT_WAVEFORM_SIGNAL_CYCLE_LIMIT;
}

function waveformWindowCycleBudget(signalCount: number): number {
  return Math.max(64, Math.min(512, Math.floor(WAVEFORM_WINDOW_SIGNAL_CYCLE_BUDGET / Math.max(1, signalCount))));
}

function waveformWindowGrid(signalCount: number): number {
  const maxWindowCycles = waveformWindowCycleBudget(signalCount);
  return Math.min(256, 2 ** Math.floor(Math.log2(Math.max(32, Math.floor(maxWindowCycles / 2)))));
}

function waveformWindowTileSpan(signalCount: number): number {
  return waveformWindowGrid(signalCount) * 2;
}

export type TimelineGeometryOwnerContext = Readonly<{
  mappingCache: DisplayTimeMappingCache;
  geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>;
  getDocument: () => CanonicalDocument;
  getProjection: () => RenderProjection;
  onSnapIndexBuilt: () => void;
}>;

function firstPointAfter(candidates: readonly { readonly point: { readonly x: number } }[], x: number): number {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (candidates[middle]!.point.x <= x) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Read-only authority for semantic -> display -> local -> screen timeline geometry. */
export class TimelineGeometryOwner {
  readonly mappingCache: DisplayTimeMappingCache;
  readonly geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>;
  readonly snapService = new SemanticSnapCandidateService();
  readonly screen = new DefaultScreenGeometryProjector();
  #timeAxis: TimeAxisGeometry = { mode: "clockless" };
  #presentationScale = 1;
  #waveWidthPxPerDisplayCycle: number | undefined;
  #waveOriginPx: number | undefined;
  #snapIndex: ImmutableSnapIndex | undefined;
  #cycleBoundaryCandidates: ReturnType<ImmutableSnapIndex["entries"]> = [];
  #viewportBoundaryCache: { readonly geometry: LocalGeometryMap; readonly mapping: DisplayTimeMapping; readonly entries: readonly { readonly cycle: number; readonly x: number }[] } | undefined;
  #sourceWindowCache: { readonly document: CanonicalDocument; readonly localStart: number; readonly localEnd: number; readonly overscan: number; readonly result: Readonly<{ start: number; end: number }> } | undefined;
  #requestedSourceCycle: number | undefined;

  constructor(private readonly context: TimelineGeometryOwnerContext) {
    this.mappingCache = context.mappingCache;
    this.geometryMaps = context.geometryMaps;
  }

  get displayMapping(): DisplayTimeMapping {
    const document = this.context.getDocument();
    return this.mappingCache.get(document.timeline, document.timeGroups);
  }

  get timeAxis(): TimeAxisGeometry { return this.#timeAxis; }
  get presentationScale(): number { return this.#presentationScale; }
  get snapIndex(): ImmutableSnapIndex | undefined { return this.#snapIndex; }
  /** Document-wide pixels-per-display-cycle, as of the ruler's last authoritative
   * rebuild (see build-ruler.ts). Bounded (#587) wave-owner mounts read this --
   * rather than re-deriving it from their own rendered geometry, or reading the
   * `--wave-width` CSS custom property back out of the DOM -- so every owner's
   * proportional width stays in lockstep with the ruler regardless of which
   * window happens to be currently mounted, or when relative to a ruler rebuild
   * that owner's own window last changed (#614). */
  get waveWidthPxPerDisplayCycle(): number | undefined { return this.#waveWidthPxPerDisplayCycle; }
  /** Screen-space X of display-cycle 0, as of the ruler's last authoritative
   * rebuild -- the same coordinate-system origin the ruler's own ticks use
   * (`point.x * scale`, including whatever fixed left margin WaveDrom's own
   * rendering bakes into its raw geometry). A windowed wave-owner's inline
   * `left` must be computed in this same coordinate system, not a naive
   * `display * waveWidthPxPerDisplayCycle` with an implicit zero intercept,
   * or every owner ends up offset from the ruler by that fixed margin (#620). */
  get waveOriginPx(): number | undefined { return this.#waveOriginPx; }

  updatePresentation(timeAxis: TimeAxisGeometry, presentationScale: number, waveWidthPxPerDisplayCycle?: number, waveOriginPx?: number): void {
    const geometryChanged = this.#presentationScale !== presentationScale
      || this.#timeAxis.mode !== timeAxis.mode
      || this.#timeAxis.ownerSignalId !== timeAxis.ownerSignalId
      || this.#timeAxis.geometry !== timeAxis.geometry;
    this.#timeAxis = timeAxis;
    this.#presentationScale = presentationScale;
    if (waveWidthPxPerDisplayCycle !== undefined) this.#waveWidthPxPerDisplayCycle = waveWidthPxPerDisplayCycle;
    if (waveOriginPx !== undefined) this.#waveOriginPx = waveOriginPx;
    if (geometryChanged) this.invalidateSnapIndex();
  }

  reset(): void {
    this.#timeAxis = { mode: "clockless" };
    this.#presentationScale = 1;
    this.#waveWidthPxPerDisplayCycle = undefined;
    this.#waveOriginPx = undefined;
    this.invalidateSnapIndex();
    this.#requestedSourceCycle = undefined;
  }

  requestSourceCycle(cycle: number): void {
    const document = this.context.getDocument();
    if (Number.isInteger(cycle) && cycle >= 0 && cycle <= document.timeline.cycleCount) this.#requestedSourceCycle = cycle;
  }

  clearRequestedSourceCycle(): void { this.#requestedSourceCycle = undefined; }

  resolveTimeAxis(document: CanonicalDocument = this.context.getDocument()): TimeAxisGeometry {
    return resolveTimeAxisGeometry(document, this.geometryMaps);
  }

  sourceBoundaryToLocalX(document: CanonicalDocument, cycle: number): number | undefined {
    const axis = this.resolveTimeAxis(document);
    if (!axis.geometry || axis.ownerSignalId === undefined) return undefined;
    const mapping = this.mappingCache.get(document.timeline, document.timeGroups);
    const displayCycle = displayBoundaryForSource(mapping, cycle, document.timeline.cycleCount);
    if (displayCycle === undefined) return undefined;
    // Bounded folded geometry is rebased with canonical source identities.
    // Keep the display-cycle lookup as the identity/no-fold fallback.
    const point = axis.geometry.find({ signalId: axis.ownerSignalId, cycle, point: "cycle-start" })?.point
      ?? axis.geometry.find({ signalId: axis.ownerSignalId, cycle: displayCycle, point: "cycle-start" })?.point;
    if (point !== undefined) return point.x * this.#presentationScale;

    // A bounded WaveDrom render intentionally retains detailed boundary
    // geometry only around its current window. Transaction bars can refer to
    // canonical start/end cycles outside that mounted window, though. Use
    // the same ruler-owned origin and pixels-per-display-cycle published by
    // buildRuler to project those boundaries; never infer pitch from Cycle
    // DOM nodes or build a Transaction-local time mapper. The display mapping
    // above preserves collapsed TimeGroups and keeps all surfaces on the
    // shared time axis.
    const pixelsPerDisplayCycle = this.#waveWidthPxPerDisplayCycle;
    const waveOriginPx = this.#waveOriginPx;
    if (pixelsPerDisplayCycle === undefined || !Number.isFinite(pixelsPerDisplayCycle) || pixelsPerDisplayCycle <= 0
      || waveOriginPx === undefined || !Number.isFinite(waveOriginPx)) return undefined;
    return waveOriginPx + displayCycle * pixelsPerDisplayCycle;
  }

  #lastBoundedWindow: { start: number; end: number; cycleCount: number } | undefined;
  /** Resolve a local time viewport to canonical source cycles using semantic geometry. */
  sourceWindowForLocalRange(document: CanonicalDocument, localStart: number, localEnd: number, overscan = 2): Readonly<{ start: number; end: number }> {
    // Keep low-work documents in one WaveDrom artifact so their geometry stays
    // stable while scrolling. High cycle×signal work uses the same shared
    // viewport geometry path as large documents, even when cycleCount is modest.
    const signalCount = document.signals.length;
    const fullDocumentWindow = usesFullDocumentWaveformWindow(document.timeline.cycleCount, signalCount);
    if (fullDocumentWindow) return { start: 0, end: document.timeline.cycleCount };
    if (this.#requestedSourceCycle !== undefined) {
      const span = Math.min(waveformWindowCycleBudget(signalCount), document.timeline.cycleCount);
      const start = Math.max(0, Math.min(this.#requestedSourceCycle - Math.floor(span / 2), document.timeline.cycleCount - span));
      return { start, end: Math.min(document.timeline.cycleCount, start + span) };
    }
    const cached = this.#sourceWindowCache;
    if (cached?.document === document && cached.localStart === localStart && cached.localEnd === localEnd && cached.overscan === overscan) return cached.result;
    const remember = (result: Readonly<{ start: number; end: number }>) => {
      this.#sourceWindowCache = { document, localStart, localEnd, overscan, result };
      return result;
    };
    const axis = this.resolveTimeAxis(document);
    const mapping = this.displayMapping;
    const owner = axis.geometry && axis.ownerSignalId !== undefined ? axis.geometry : this.geometryMaps.values().next().value;
    const signalId = axis.ownerSignalId ?? owner?.signalId;
    if (!owner || signalId === undefined) {
      // Bootstrap only: before the first authoritative WaveDrom geometry exists,
      // render a bounded prefix so large documents can reach the viewport. This
      // is presentation bootstrap, never semantic time/X truth; the first SVG
      // geometry replaces it and is rebased through sourceWindow.start.
      // Match the first viewport tile size so authoritative geometry does not
      // immediately replace this bootstrap artifact with a different window.
      const bootstrapEnd = Math.min(document.timeline.cycleCount, waveformWindowTileSpan(signalCount));
      return remember({ start: 0, end: bootstrapEnd });
    }
    const entries = this.viewportBoundaryEntries(owner, signalId, mapping, document.timeline.cycleCount);
    // A first WaveDrom paint may expose only presentation-thinned marks. Do
    // not let that partial map become the navigation source for a large
    // document; request the bounded bootstrap window until a windowed render
    // replaces it with semantic boundaries.
    if (document.timeline.cycleCount > 4096 && entries.length < 512 && localEnd <= 2_048) {
      return remember({ start: 0, end: Math.min(document.timeline.cycleCount, 2048) });
    }
    // Retained geometry is intentionally bounded. When the requested local
    // range lies outside that retained interval, use the same shared display
    // mapping to recover source boundaries instead of treating the retained
    // edge as the end of the document. This keeps windowing bounded while
    // allowing scroll/navigation to reach offscreen source time.
    const firstEntry = entries[0];
    const lastEntry = entries.at(-1);
    // Outside the retained window the local x is a pixel-space value, not a display-cycle index (#757):
    // extrapolate with the retained geometry's own pitch (local units per display cycle).
    const firstDisplay = firstEntry === undefined ? undefined : mapping.sourceToDisplay[firstEntry.cycle];
    const lastDisplay = lastEntry === undefined ? undefined : mapping.sourceToDisplay[lastEntry.cycle];
    const pitch = firstEntry && lastEntry && firstDisplay !== undefined && lastDisplay !== undefined && lastDisplay > firstDisplay
      ? (lastEntry.x - firstEntry.x) / (lastDisplay - firstDisplay) : undefined;
    const sourceAtMappedBoundary = (localX: number, fallback: number): number => {
      const displayIndex = pitch !== undefined && pitch > 0 && firstEntry !== undefined && firstDisplay !== undefined
        ? firstDisplay + (localX - firstEntry.x) / pitch
        : localX;
      const displayCycle = Math.max(0, Math.min(mapping.displayCycleCount, Math.round(displayIndex)));
      if (displayCycle === mapping.displayCycleCount) return document.timeline.cycleCount;
      return mapping.displayToSource[displayCycle] ?? fallback;
    };
    let start = sourceAtMappedBoundary(localStart, firstEntry?.cycle ?? 0);
    let end = sourceAtMappedBoundary(localEnd, lastEntry?.cycle ?? document.timeline.cycleCount);
    if (firstEntry && lastEntry && localStart <= lastEntry.x && localEnd >= firstEntry.x) {
      // A viewport may overlap the retained geometry while extending beyond
      // either edge. Preserve the extrapolated endpoint in that case; clamping
      // it to the mounted edge makes the shared window grow one tile per
      // WaveDrom batch, needlessly reinstalling every visible owner.
      start = localStart < firstEntry.x ? sourceAtMappedBoundary(localStart, firstEntry.cycle) : firstEntry.cycle;
      end = localEnd > lastEntry.x ? sourceAtMappedBoundary(localEnd, lastEntry.cycle) : lastEntry.cycle;
      for (const entry of entries) {
        if (entry.x <= localStart) start = entry.cycle;
        if (entry.x >= localEnd) { end = entry.cycle; break; }
      }
    }
    const boundedStart = Math.max(0, start - overscan);
    const boundedEnd = Math.min(document.timeline.cycleCount, end + overscan);
    // Keep a useful semantic window: the visible viewport may contain only ~28
    // cycles, but allowing that presentation subset to replace the bounded
    // geometry window would discard offscreen navigation boundaries. DOM stays
    // virtualized; this budget applies only to the source-time geometry artifact.
    if (!fullDocumentWindow) {
      // Quantize the window to a grid: a window that starts exactly at the viewport start changes on every
      // scroll step, so a sustained drag re-rendered every mounted WaveDrom owner continuously (#621/#637).
      // Use a signal-count-scaled grid so dense documents keep each waveform artifact bounded.
      // Tile-style reuse (#621): while the visible range (with overscan) still lies inside the
      // window handed out last, return that same window so unchanged owners are not re-rendered.
      const last = this.#lastBoundedWindow;
      if (last && last.cycleCount === document.timeline.cycleCount && boundedStart >= last.start && boundedEnd <= last.end) return remember({ start: last.start, end: last.end });
      const grid = waveformWindowGrid(signalCount);
      const start = Math.max(0, Math.floor(boundedStart / grid) * grid);
      const span = Math.min(document.timeline.cycleCount, Math.max(grid * 2, Math.ceil((boundedEnd - start) / grid) * grid));
      const clampedStart = Math.max(0, Math.min(start, document.timeline.cycleCount - span));
      this.#lastBoundedWindow = { start: clampedStart, end: clampedStart + span, cycleCount: document.timeline.cycleCount };
      return remember({ start: clampedStart, end: clampedStart + span });
    }
    return remember({ start: boundedStart, end: boundedEnd });
  }

  viewportForLocalRange(localStart: number, localEnd: number, rowStart: number, rowEnd: number, generation: number, pinnedIds: readonly string[] = []): DisplayTimeViewport {
    const document = this.context.getDocument();
    const axis = this.resolveTimeAxis(document);
    const mapping = this.displayMapping;
    // This query must remain independent of the annotation snap index: building
    // that index resolves every annotation and defeats viewport-bounded overlay
    // projection. Cycle boundaries are cheap semantic geometry owned by the axis.
    const sourceWindow = this.sourceWindowForLocalRange(document, localStart, localEnd, 2);
    const before = sourceWindow.start;
    const after = sourceWindow.end;
    return createDisplayTimeViewport(mapping, mapping.sourceToDisplay[before] ?? 0, mapping.sourceToDisplay[after] ?? (after >= mapping.sourceToDisplay.length ? mapping.displayCycleCount : 0), 2, rowStart, rowEnd, generation, pinnedIds);
  }

  screenToLocal(point: Point, zoom: number, scrollX = 0, scrollY = 0): Point {
    return this.screen.fromScreen(point, { scrollX, scrollY, zoom });
  }

  cycleBoundaryAtScreenX(clientX: number, surfaceLeft: number, zoom: number, snapEnabled: boolean): number | undefined {
    const localX = this.screenToLocal({ x: clientX - surfaceLeft, y: 0 }, zoom).x;
    return this.cycleBoundaryAtLocalX(localX, zoom, snapEnabled);
  }

  /** Resolve a cycle boundary without consulting any rendered Cycle surface. */
  cycleBoundaryAtLocalX(localX: number, zoom: number, snapEnabled: boolean): number | undefined {
    this.currentSnapIndex();
    const candidates = this.#cycleBoundaryCandidates;
    if (!snapEnabled) {
      const terminal = candidates.at(-1);
      if (terminal && localX >= terminal.point.x - 32 / zoom) return terminal.anchor.cycle;
      const insertion = firstPointAfter(candidates, localX);
      return candidates[Math.max(0, insertion - 1)]?.anchor.cycle;
    }
    const insertion = firstPointAfter(candidates, localX);
    const before = candidates[insertion - 1];
    const after = candidates[insertion];
    if (!before) return after?.anchor.cycle;
    if (!after) return before.anchor.cycle;
    return Math.abs(before.point.x - localX) <= Math.abs(after.point.x - localX) ? before.anchor.cycle : after.anchor.cycle;
  }

  currentSnapIndex(): ImmutableSnapIndex {
    if (!this.#snapIndex) {
      const document = this.context.getDocument();
      this.#snapIndex = buildSnapIndex(document, this.context.getProjection(), this.geometryMaps, this.mappingCache.get(document.timeline, document.timeGroups), this.snapService, this.#presentationScale);
      this.#cycleBoundaryCandidates = this.#snapIndex.entries().filter((candidate) => candidate.kind === "cycle-boundary").sort((left, right) => left.point.x - right.point.x);
      this.context.onSnapIndexBuilt();
    }
    return this.#snapIndex;
  }

  invalidateSnapIndex(): void { this.#snapIndex = undefined; this.#cycleBoundaryCandidates = []; this.#viewportBoundaryCache = undefined; this.#sourceWindowCache = undefined; }

  private viewportBoundaryEntries(owner: LocalGeometryMap, signalId: SignalId, mapping: DisplayTimeMapping, cycleCount: number): readonly { readonly cycle: number; readonly x: number }[] {
    const cached = this.#viewportBoundaryCache;
    if (cached?.geometry === owner && cached.mapping === mapping) return cached.entries;
    const entries: { cycle: number; x: number }[] = [];
    const boundaryByDisplayCycle = owner.cycleBoundaryEntries === undefined
      ? undefined
      : new Map(owner.cycleBoundaryEntries().map((entry) => [entry.cycle, entry.position.x]));
    // The geometry map already owns the bounded semantic boundary index.
    // Iterating canonical 0..cycleCount here defeats bounded rendering for
    // large timelines and is repeated once per waveform owner. Filter the
    // retained entries through the shared mapping instead.
    for (const boundary of owner.cycleBoundaryEntries?.() ?? []) {
      const cycle = boundary.cycle;
      if (cycle < 0 || cycle > cycleCount || mapping.sourceToDisplay[cycle] === undefined) continue;
      // Geometry boundaries are source-keyed even when the display mapping
      // compresses folded cycles. Do not feed a display cycle back into the
      // source geometry map: after a fold, source 60 would otherwise resolve
      // through display 40 and acquire source 40's X position.
      const x = boundaryByDisplayCycle?.get(cycle) ?? boundary.position.x;
      if (x !== undefined) entries.push({ cycle, x });
    }
    this.#viewportBoundaryCache = { geometry: owner, mapping, entries };
    return entries;
  }
}
