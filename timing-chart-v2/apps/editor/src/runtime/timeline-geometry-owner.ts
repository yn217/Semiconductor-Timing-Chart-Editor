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
  }

  resolveTimeAxis(document: CanonicalDocument = this.context.getDocument()): TimeAxisGeometry {
    return resolveTimeAxisGeometry(document, this.geometryMaps);
  }

  sourceBoundaryToLocalX(document: CanonicalDocument, cycle: number): number | undefined {
    const axis = this.resolveTimeAxis(document);
    if (!axis.geometry || axis.ownerSignalId === undefined) return undefined;
    const mapping = this.mappingCache.get(document.timeline, document.timeGroups);
    const displayCycle = displayBoundaryForSource(mapping, cycle, document.timeline.cycleCount);
    if (displayCycle === undefined) return undefined;
    const point = axis.geometry.find({ signalId: axis.ownerSignalId, cycle: displayCycle, point: "cycle-start" })?.point;
    return point === undefined ? undefined : point.x * this.#presentationScale;
  }

  viewportForLocalRange(localStart: number, localEnd: number, rowStart: number, rowEnd: number, generation: number, pinnedIds: readonly string[] = []): DisplayTimeViewport {
    const candidates = this.currentSnapIndex().entries().filter((candidate) => candidate.kind === "cycle-boundary").sort((a, b) => a.point.x - b.point.x);
    const before = candidates.filter((candidate) => candidate.point.x <= localStart).at(-1)?.anchor.cycle ?? 0;
    const after = candidates.find((candidate) => candidate.point.x >= localEnd)?.anchor.cycle ?? this.context.getDocument().timeline.cycleCount;
    const mapping = this.displayMapping;
    return createDisplayTimeViewport(mapping, mapping.sourceToDisplay[before] ?? 0, mapping.sourceToDisplay[after] ?? mapping.displayCycleCount, 2, rowStart, rowEnd, generation, pinnedIds);
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

  invalidateSnapIndex(): void { this.#snapIndex = undefined; this.#cycleBoundaryCandidates = []; }
}
