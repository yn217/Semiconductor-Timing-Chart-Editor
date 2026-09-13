import { DefaultScreenGeometryProjector, resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { createDisplayTimeViewport, DisplayTimeMappingCache, type DisplayTimeMapping, type DisplayTimeViewport, type RenderProjection } from "@timing-chart-v2/projection";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { displayBoundaryForSource } from "./display-boundary.js";
import { buildSnapIndex } from "./snap-index.js";

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
  #snapIndex: ImmutableSnapIndex | undefined;
  #cycleBoundaryCandidates: ReturnType<ImmutableSnapIndex["entries"]> = [];
  #viewportBoundaryCache: { readonly geometry: LocalGeometryMap; readonly mapping: DisplayTimeMapping; readonly entries: readonly { readonly cycle: number; readonly x: number }[] } | undefined;
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

  updatePresentation(timeAxis: TimeAxisGeometry, presentationScale: number): void {
    const geometryChanged = this.#presentationScale !== presentationScale
      || this.#timeAxis.mode !== timeAxis.mode
      || this.#timeAxis.ownerSignalId !== timeAxis.ownerSignalId
      || this.#timeAxis.geometry !== timeAxis.geometry;
    this.#timeAxis = timeAxis;
    this.#presentationScale = presentationScale;
    if (geometryChanged) this.invalidateSnapIndex();
  }

  reset(): void {
    this.#timeAxis = { mode: "clockless" };
    this.#presentationScale = 1;
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
    return point === undefined ? undefined : point.x * this.#presentationScale;
  }

  /** Resolve a local time viewport to canonical source cycles using semantic geometry. */
  sourceWindowForLocalRange(document: CanonicalDocument, localStart: number, localEnd: number, overscan = 2): Readonly<{ start: number; end: number }> {
    if (this.#requestedSourceCycle !== undefined) {
      const span = Math.min(2048, document.timeline.cycleCount);
      const start = Math.max(0, Math.min(this.#requestedSourceCycle - Math.floor(span / 2), document.timeline.cycleCount - span));
      return { start, end: Math.min(document.timeline.cycleCount, start + span) };
    }
    const axis = this.resolveTimeAxis(document);
    const mapping = this.displayMapping;
    const owner = axis.geometry && axis.ownerSignalId !== undefined ? axis.geometry : this.geometryMaps.values().next().value;
    const signalId = axis.ownerSignalId ?? owner?.signalId;
    if (!owner || signalId === undefined) {
      // Bootstrap only: before the first authoritative WaveDrom geometry exists,
      // render a bounded prefix so large documents can reach the viewport. This
      // is presentation bootstrap, never semantic time/X truth; the first SVG
      // geometry replaces it and is rebased through sourceWindow.start.
      const bootstrapEnd = Math.min(document.timeline.cycleCount, 2048);
      return { start: 0, end: bootstrapEnd };
    }
    const entries = this.viewportBoundaryEntries(owner, signalId, mapping, document.timeline.cycleCount);
    // A first WaveDrom paint may expose only presentation-thinned marks. Do
    // not let that partial map become the navigation source for a large
    // document; request the bounded bootstrap window until a windowed render
    // replaces it with semantic boundaries.
    if (document.timeline.cycleCount > 4096 && entries.length < 512) {
      return { start: 0, end: Math.min(document.timeline.cycleCount, 2048) };
    }
    let start = 0;
    let end = document.timeline.cycleCount;
    for (const entry of entries) {
      if (entry.x <= localStart) start = entry.cycle;
      if (entry.x >= localEnd) { end = entry.cycle; break; }
    }
    const boundedStart = Math.max(0, start - overscan);
    const boundedEnd = Math.min(document.timeline.cycleCount, end + overscan);
    // Keep a useful semantic window for large documents.  The visible
    // viewport may contain only ~28 cycles, but allowing that presentation
    // subset to replace the bounded geometry window would discard offscreen
    // navigation boundaries on the next render.  DOM remains virtualized;
    // this minimum applies only to the source-time geometry artifact.
    if (document.timeline.cycleCount > 4096 && boundedEnd - boundedStart < 2048) {
      const span = Math.min(2048, document.timeline.cycleCount);
      const centered = Math.max(0, Math.min(boundedStart, document.timeline.cycleCount - span));
      return { start: centered, end: centered + span };
    }
    return { start: boundedStart, end: boundedEnd };
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
    return createDisplayTimeViewport(mapping, mapping.sourceToDisplay[before] ?? 0, mapping.sourceToDisplay[after] ?? 0, 2, rowStart, rowEnd, generation, pinnedIds);
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

  invalidateSnapIndex(): void { this.#snapIndex = undefined; this.#cycleBoundaryCandidates = []; this.#viewportBoundaryCache = undefined; }

  private viewportBoundaryEntries(owner: LocalGeometryMap, signalId: SignalId, mapping: DisplayTimeMapping, cycleCount: number): readonly { readonly cycle: number; readonly x: number }[] {
    const cached = this.#viewportBoundaryCache;
    if (cached?.geometry === owner && cached.mapping === mapping) return cached.entries;
    const entries: { cycle: number; x: number }[] = [];
    const boundaryByDisplayCycle = owner.cycleBoundaryEntries === undefined
      ? undefined
      : new Map(owner.cycleBoundaryEntries().map((entry) => [entry.cycle, entry.position.x]));
    for (let cycle = 0; cycle <= cycleCount; cycle += 1) {
      const displayCycle = mapping.sourceToDisplay[cycle];
      if (displayCycle === undefined) continue;
      const x = boundaryByDisplayCycle?.get(displayCycle) ?? owner.find({ signalId, cycle: displayCycle, point: "cycle-start" })?.point.x;
      if (x !== undefined) entries.push({ cycle, x });
    }
    this.#viewportBoundaryCache = { geometry: owner, mapping, entries };
    return entries;
  }
}
