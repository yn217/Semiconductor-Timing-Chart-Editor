import { DefaultScreenGeometryProjector, resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { DisplayTimeMappingCache, type DisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
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
      return candidates.filter((candidate) => candidate.point.x <= localX).at(-1)?.anchor.cycle ?? candidates[0]?.anchor.cycle;
    }
    let nearest: { cycle: number; distance: number } | undefined;
    for (const candidate of candidates) {
      const distance = Math.abs(candidate.point.x - localX);
      if (!nearest || distance < nearest.distance) nearest = { cycle: candidate.anchor.cycle, distance };
    }
    return nearest?.cycle;
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
