import { anchorTransitionFraction } from "@timing-chart-v2/schema";
import type { AnchorPoint, Annotation, Bookmark, CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

export interface TransactionTimeTransform {
  readonly clockCyclesPerTransactionCycle: number;
  transactionCycleToClock(transactionCycle: number): number;
  clockToTransactionCycle(clockCycle: number): number;
  transactionCycleToWorldX(transactionCycle: number, originX: number, unitsPerTransactionCycle: number): number;
  worldXToTransactionCycle(worldX: number, originX: number, unitsPerTransactionCycle: number): number;
}

export function createTransactionTimeTransform(clockCyclesPerTransactionCycle = 1): TransactionTimeTransform {
  if (!Number.isFinite(clockCyclesPerTransactionCycle) || clockCyclesPerTransactionCycle <= 0) throw new Error("Transaction time scale must be positive and finite.");
  return Object.freeze({ clockCyclesPerTransactionCycle, transactionCycleToClock: (value: number) => value * clockCyclesPerTransactionCycle, clockToTransactionCycle: (value: number) => value / clockCyclesPerTransactionCycle, transactionCycleToWorldX: (value: number, originX: number, units: number) => originX + value * units, worldXToTransactionCycle: (worldX: number, originX: number, units: number) => (worldX - originX) / units });
}

export interface Point { readonly x: number; readonly y: number }
export interface ViewTransform { readonly scrollX: number; readonly scrollY: number; readonly zoom: number }

export interface MeasurementLaneSpan {
  readonly id: string;
  readonly firstX: number;
  readonly secondX: number;
  readonly explicitLane?: number;
}

export interface MeasurementLaneAllocationMetrics {
  spansVisited: number;
  indexOperations: number;
  laneComparisons: number;
  allocatedLanes: number;
  explicitLanes: number;
  durationMs: number;
}

/**
 * Allocate dimension-measurement lanes from resolved screen-independent X
 * spans.  Both the live overlay and export use this same derived policy so
 * overlapping measurements receive a new lane instead of collapsing onto lane
 * zero when all existing lanes are occupied.
 */
export function allocateMeasurementLanes(spans: readonly MeasurementLaneSpan[], metrics?: MeasurementLaneAllocationMetrics): ReadonlyMap<string, number> {
  const startedAt = metrics ? Date.now() : 0;
  const laneById = new Map<string, number>();
  const laneEnds: number[] = [];
  const allocatedLaneIds = metrics ? new Set<number>() : undefined;
  // Preserve the old array-index lane domain without allocating one entry per
  // possible lane: explicit lane values can be sparse and very large.
  const maxArrayIndex = 0xffff_fffe;
  const explicitArrayLanes = spans.flatMap((span) => span.explicitLane !== undefined
    && Number.isInteger(span.explicitLane)
    && span.explicitLane >= 0
    && span.explicitLane <= maxArrayIndex
    ? [span.explicitLane]
    : []);
  const maxExplicitArrayLane = explicitArrayLanes.reduce((max, lane) => Math.max(max, lane), -1);
  const laneIds = new Set<number>(explicitArrayLanes);
  for (let lane = 0; lane <= spans.length; lane += 1) laneIds.add(lane);
  if (maxExplicitArrayLane >= 0) {
    for (let offset = 1; offset <= spans.length + 1; offset += 1) laneIds.add(maxExplicitArrayLane + offset);
  }
  const candidateLaneIds = [...laneIds].sort((left, right) => left - right);
  const candidateIndexByLane = new Map(candidateLaneIds.map((lane, index) => [lane, index]));
  let leafCount = 1;
  const maxLaneCount = candidateLaneIds.length;
  while (leafCount < maxLaneCount) leafCount *= 2;
  const minLaneEndTree = new Float64Array(leafCount * 2);
  minLaneEndTree.fill(Number.POSITIVE_INFINITY);
  let laneComparisons = 0;
  let indexOperations = 0;
  let explicitLanes = 0;
  const findFirstFreeLane = (startX: number): number => {
    let node = 1;
    let firstLane = 0;
    let lastLane = leafCount;
    while (node < leafCount) {
      if (metrics) indexOperations += 1;
      const left = node * 2;
      if (metrics) laneComparisons += 1;
      if (minLaneEndTree[left]! <= startX) {
        node = left;
        lastLane = Math.floor((firstLane + lastLane) / 2);
      } else {
        node = left + 1;
        firstLane = Math.floor((firstLane + lastLane) / 2);
      }
    }
    if (metrics) indexOperations += 1;
    return firstLane < candidateLaneIds.length && minLaneEndTree[node]! <= startX ? candidateLaneIds[firstLane]! : -1;
  };
  const updateLaneEnd = (lane: number, endX: number): void => {
    const candidateIndex = candidateIndexByLane.get(lane);
    if (candidateIndex === undefined) return;
    let node = leafCount + candidateIndex;
    minLaneEndTree[node] = endX;
    while (node > 1) {
      node = Math.floor(node / 2);
      if (metrics) indexOperations += 1;
      minLaneEndTree[node] = Math.min(minLaneEndTree[node * 2]!, minLaneEndTree[node * 2 + 1]!);
    }
  };

  for (const span of spans) {
    const startX = Math.min(span.firstX, span.secondX);
    const endX = Math.max(span.firstX, span.secondX);
    let lane = span.explicitLane;
    if (lane !== undefined) {
      if (metrics) explicitLanes += 1;
    } else {
      const firstFreeLane = findFirstFreeLane(startX);
      lane = firstFreeLane >= 0 ? firstFreeLane : laneEnds.length;
    }
    laneById.set(span.id, lane);
    allocatedLaneIds?.add(lane);
    laneEnds[lane] = Math.max(laneEnds[lane] ?? Number.NEGATIVE_INFINITY, endX);
    updateLaneEnd(lane, laneEnds[lane]!);
  }
  if (metrics) Object.assign(metrics, { spansVisited: spans.length, indexOperations, laneComparisons, allocatedLanes: allocatedLaneIds!.size, explicitLanes, durationMs: Date.now() - startedAt });
  return laneById;
}

export interface LocalAnchorGeometry {
  readonly signalId: SignalId;
  readonly anchor: SemanticAnchor;
  readonly point: Point;
}

export interface LocalGeometryMap {
  readonly signalId: SignalId;
  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined;
  /** Semantic cycle boundaries owned by this geometry map. */
  cycleBoundaryEntries?(): readonly LocalGeometryEntry[];
  /**
   * Directly exposes the immutable geometry entries that represent actual
   * clock edges.  Consumers that need an edge index can use this optional
   * capability without probing every source cycle through `find()`.
   */
  edgeEntries?(): readonly LocalGeometryEntry[];
}

/**
 * The single derived owner used by every time-axis consumer.  A clock is an
 * optional semantic reference, not a prerequisite for a usable horizontal
 * axis.  In clockless mode the owner is selected from an actually rendered
 * timing signal's Local Geometry; no canonical or visible synthetic signal is
 * introduced.
 */
export interface TimeAxisGeometry {
  readonly mode: "reference-clock" | "clockless";
  readonly ownerSignalId?: SignalId;
  readonly geometry?: LocalGeometryMap;
}

export function resolveTimeAxisGeometry(document: Pick<CanonicalDocument, "signals" | "timeline">, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>): TimeAxisGeometry {
  const referenceClock = document.timeline.referenceClock;
  if (referenceClock !== undefined) {
    // The canonical signal identity is authoritative.  A renderer may still
    // have a stale extracted map for one frame after delete/restore, but that
    // map must never keep a deleted or converted signal as the time-axis owner.
    const referenceSignal = document.signals.find((signal) => signal.id === referenceClock);
    const referenceGeometry = referenceSignal?.type === "clock" ? geometryMaps.get(referenceClock) : undefined;
    if (referenceGeometry) return Object.freeze({ mode: "reference-clock", ownerSignalId: referenceClock, geometry: referenceGeometry });
  }
  const timingSignals = document.signals.filter((signal) => signal.type !== "commentRow");
  const owner = timingSignals.find((signal) => signal.display.visible !== false && geometryMaps.has(signal.id))
    ?? timingSignals.find((signal) => geometryMaps.has(signal.id));
  const geometry = owner === undefined ? undefined : geometryMaps.get(owner.id);
  return geometry === undefined || owner === undefined
    ? Object.freeze({ mode: "clockless" })
    : Object.freeze({ mode: "clockless", ownerSignalId: owner.id, geometry });
}

export interface LocalGeometryEntry {
  readonly cycle: number;
  readonly point: AnchorPoint;
  readonly threshold?: number;
  readonly position: Point;
}

export interface TransitionGeometryResolver {
  readonly cycle: number;
  readonly point: AnchorPoint;
  readonly resolve: (fraction: number) => Point;
}

const keyOf = (cycle: number, point: AnchorPoint, threshold?: number): string => `${cycle}:${point}:${threshold ?? ""}`;

export class ImmutableLocalGeometryMap implements LocalGeometryMap {
  readonly signalId: SignalId;
  readonly #entries: ReadonlyMap<string, Point>;
  readonly #edgeEntries: readonly LocalGeometryEntry[];
  readonly #cycleBoundaryEntries: readonly LocalGeometryEntry[];
  readonly #transitionResolvers: ReadonlyMap<string, (fraction: number) => Point>;

  constructor(signalId: SignalId, entries: readonly LocalGeometryEntry[], transitionResolvers: readonly TransitionGeometryResolver[] = []) {
    this.signalId = signalId;
    const frozenEntries = entries.map((entry) => Object.freeze({ ...entry, position: Object.freeze({ ...entry.position }) }));
    this.#entries = new Map(frozenEntries.map((entry) => [keyOf(entry.cycle, entry.point, entry.threshold), entry.position]));
    this.#edgeEntries = Object.freeze(frozenEntries.filter((entry) => entry.point === "rising-edge" || entry.point === "falling-edge"));
    this.#cycleBoundaryEntries = Object.freeze(frozenEntries.filter((entry) => entry.point === "cycle-start"));
    this.#transitionResolvers = new Map(transitionResolvers.map((entry) => [keyOf(entry.cycle, entry.point), entry.resolve]));
  }

  edgeEntries(): readonly LocalGeometryEntry[] {
    return this.#edgeEntries;
  }

  cycleBoundaryEntries(): readonly LocalGeometryEntry[] {
    return this.#cycleBoundaryEntries;
  }

  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined {
    if (anchor.signalId !== this.signalId) return undefined;
    const fraction = anchorTransitionFraction(anchor);
    const base = this.#entries.get(keyOf(anchor.cycle, anchor.point, fraction));
    const resolved = base ?? (fraction === undefined ? undefined : this.#transitionResolvers.get(keyOf(anchor.cycle, anchor.point))?.(fraction));
    if (!resolved) return undefined;
    const point = Object.freeze({ x: resolved.x + (anchor.offset?.x ?? 0), y: resolved.y + (anchor.offset?.y ?? 0) });
    return Object.freeze({ signalId: this.signalId, anchor, point });
  }
}

/**
 * A windowed owner's geometry is produced in the window's own coordinates (first boundary at the WaveDrom margin). Every consumer
 * (snap index, hit-test, overlays, ruler) works in document-absolute local X, so a window that starts past cycle 0 is shifted by
 * its display offset. Delegating and lazy: no entry is copied unless a consumer asks for the entry list.
 */
export class OffsetLocalGeometryMap implements LocalGeometryMap {
  readonly signalId: SignalId;
  readonly #inner: LocalGeometryMap;
  readonly #dx: number;
  #boundaries: readonly LocalGeometryEntry[] | undefined;
  #edges: readonly LocalGeometryEntry[] | undefined;

  constructor(inner: LocalGeometryMap, dx: number) {
    this.signalId = inner.signalId;
    this.#inner = inner;
    this.#dx = dx;
  }

  #shift(entries: readonly LocalGeometryEntry[]): readonly LocalGeometryEntry[] {
    return Object.freeze(entries.map((entry) => ({ ...entry, position: { x: entry.position.x + this.#dx, y: entry.position.y } })));
  }

  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined {
    const found = this.#inner.find(anchor);
    return found === undefined ? undefined : Object.freeze({ ...found, point: Object.freeze({ x: found.point.x + this.#dx, y: found.point.y }) });
  }

  cycleBoundaryEntries(): readonly LocalGeometryEntry[] {
    if (this.#boundaries === undefined) this.#boundaries = this.#shift(this.#inner.cycleBoundaryEntries?.() ?? []);
    return this.#boundaries;
  }

  edgeEntries(): readonly LocalGeometryEntry[] {
    if (this.#edges === undefined) this.#edges = this.#shift(this.#inner.edgeEntries?.() ?? []);
    return this.#edges;
  }
}

export interface ScreenGeometryProjector {
  toScreen(local: LocalAnchorGeometry, transform: ViewTransform): Point;
  fromScreen(screen: Point, transform: ViewTransform): Point;
}

export class DefaultScreenGeometryProjector implements ScreenGeometryProjector {
  toScreen(local: LocalAnchorGeometry, transform: ViewTransform): Point {
    if (!Number.isFinite(transform.zoom) || transform.zoom <= 0) throw new Error("Screen Geometry zoom must be positive and finite.");
    return Object.freeze({
      x: (local.point.x - transform.scrollX) * transform.zoom,
      y: (local.point.y - transform.scrollY) * transform.zoom,
    });
  }

  fromScreen(screen: Point, transform: ViewTransform): Point {
    if (!Number.isFinite(transform.zoom) || transform.zoom <= 0) throw new Error("Screen Geometry zoom must be positive and finite.");
    return Object.freeze({
      x: screen.x / transform.zoom + transform.scrollX,
      y: screen.y / transform.zoom + transform.scrollY,
    });
  }
}

export type SnapKind = "clock-edge" | "signal-transition" | "bus-transition" | "value-boundary" | "cycle-boundary" | "cycle-center" | "signal-row" | "marker" | "annotation";

export interface SnapCandidate {
  readonly kind: SnapKind;
  readonly anchor: SemanticAnchor;
  readonly point: Point;
  readonly ownerId?: string;
}

export interface SnapResult extends SnapCandidate { readonly distance: number }

/** Lazily supplies regular-grid candidates near a query without materializing the full retained grid. */
export interface SnapCandidateSource {
  candidatesNear(point: Point, tolerance: number): readonly SnapCandidate[];
  neighborsByX?(x: number, kind: SnapKind): Readonly<{ before?: SnapCandidate; after?: SnapCandidate }>;
}

export class ImmutableSnapIndex {
  static readonly #cellSize = 32;
  readonly #candidates: readonly SnapCandidate[];
  readonly #buckets: ReadonlyMap<string, readonly number[]>;
  readonly #cycleBoundariesByX: readonly SnapCandidate[];
  #queries = 0;
  #candidatesVisited = 0;
  readonly #sources: readonly SnapCandidateSource[];

  constructor(candidates: readonly SnapCandidate[], sources: readonly SnapCandidateSource[] = []) {
    this.#sources = sources;
    this.#candidates = Object.freeze(candidates.map((candidate) => Object.freeze({ ...candidate, anchor: Object.freeze({ ...candidate.anchor }), point: Object.freeze({ ...candidate.point }) })));
    this.#cycleBoundariesByX = Object.freeze(this.#candidates.filter((candidate) => candidate.kind === "cycle-boundary").slice().sort((left, right) => left.point.x - right.point.x));
    const buckets = new Map<string, number[]>();
    this.#candidates.forEach((candidate, index) => {
      if (!Number.isFinite(candidate.point.x) || !Number.isFinite(candidate.point.y)) return;
      const key = this.#bucketKey(Math.floor(candidate.point.x / ImmutableSnapIndex.#cellSize), Math.floor(candidate.point.y / ImmutableSnapIndex.#cellSize));
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    });
    this.#buckets = new Map([...buckets.entries()].map(([key, indexes]) => [key, Object.freeze(indexes.slice())]));
  }

  nearest(point: Point, tolerance: number, kinds?: readonly SnapKind[], preferredKinds?: readonly SnapKind[]): SnapResult | undefined {
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("Snap tolerance must be finite and non-negative.");
    this.#queries += 1;
    const allowed = kinds ? new Set(kinds) : undefined;
    let result: SnapResult | undefined;
    const nearby = this.#candidateIndexesNear(point, tolerance).map((index) => this.#candidates[index]!);
    for (const source of this.#sources) nearby.push(...source.candidatesNear(point, tolerance));
    for (const candidate of nearby) {
      this.#candidatesVisited += 1;
      if (allowed && !allowed.has(candidate.kind)) continue;
      const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
      if (distance > tolerance || (result && (distance > result.distance || (distance === result.distance && queryPriority(candidate.kind, preferredKinds) <= queryPriority(result.kind, preferredKinds))))) continue;
      result = Object.freeze({ ...candidate, distance });
    }
    return result;
  }

  entries(): readonly SnapCandidate[] {
    // Lazy sources are queryable and intentionally omitted here. This API is
    // the bounded, already-materialized owner set, not a grid expansion hook.
    return this.#candidates;
  }

  neighborsByX(x: number, kind: SnapKind): Readonly<{ before?: SnapCandidate; after?: SnapCandidate }> {
    let before: SnapCandidate | undefined;
    let after: SnapCandidate | undefined;
    const update = (candidates: readonly SnapCandidate[]) => {
      let low = 0;
      let high = candidates.length;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (candidates[middle]!.point.x <= x) low = middle + 1;
        else high = middle;
      }
      const prior = candidates[low - 1];
      const next = candidates[low];
      if (prior && (!before || prior.point.x >= before.point.x)) before = prior;
      if (next && (!after || next.point.x <= after.point.x)) after = next;
    };
    if (kind === "cycle-boundary") update(this.#cycleBoundariesByX);
    for (const source of this.#sources) {
      const neighbors = source.neighborsByX?.(x, kind);
      if (neighbors?.before && (!before || neighbors.before.point.x >= before.point.x)) before = neighbors.before;
      if (neighbors?.after && (!after || neighbors.after.point.x <= after.point.x)) after = neighbors.after;
    }
    return Object.freeze({ ...(before ? { before } : {}), ...(after ? { after } : {}) });
  }

  metrics(): Readonly<{ queries: number; candidatesVisited: number }> {
    return Object.freeze({ queries: this.#queries, candidatesVisited: this.#candidatesVisited });
  }

  #bucketKey(x: number, y: number): string {
    return `${x}:${y}`;
  }

  #candidateIndexesNear(point: Point, tolerance: number): readonly number[] {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    const minX = Math.floor((point.x - tolerance) / ImmutableSnapIndex.#cellSize);
    const maxX = Math.floor((point.x + tolerance) / ImmutableSnapIndex.#cellSize);
    const minY = Math.floor((point.y - tolerance) / ImmutableSnapIndex.#cellSize);
    const maxY = Math.floor((point.y + tolerance) / ImmutableSnapIndex.#cellSize);
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
    if (!Number.isFinite(cellCount) || cellCount > 4096) return this.#candidates.map((_, index) => index);
    const indexes: number[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const bucket = this.#buckets.get(this.#bucketKey(x, y));
        if (bucket) indexes.push(...bucket);
      }
    }
    indexes.sort((left, right) => left - right);
    return indexes;
  }
}

function snapPriority(kind: SnapKind): number {
  return ({ "signal-row": 1, "cycle-center": 2, "cycle-boundary": 3, "value-boundary": 4, "signal-transition": 5, "bus-transition": 6, "clock-edge": 7, marker: 8, annotation: 9 })[kind];
}

function queryPriority(kind: SnapKind, preferredKinds?: readonly SnapKind[]): number {
  const index = preferredKinds?.indexOf(kind) ?? -1;
  return index < 0 ? snapPriority(kind) : 100 + preferredKinds!.length - index;
}

export interface SemanticSnapGeometryInput {
  readonly document: Pick<CanonicalDocument, "signals" | "timeline" | "bookmarks" | "annotations">;
  readonly geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>;
  readonly rowY: ReadonlyMap<SignalId, number>;
  /** Derived TimeAxis owner used for anchors without an explicit signal. */
  readonly axisOwnerSignalId?: SignalId;
  /** Number of cycles in the rendered geometry (may be smaller than source time after a fold). */
  readonly renderedCycleCount?: number;
  /** Map a rendered/display cycle to its canonical source cycle. */
  readonly sourceCycleForRenderedCycle?: (renderedCycle: number) => number | undefined;
  /** Map a canonical source cycle to its rendered/display cycle. */
  readonly renderedCycleForSourceCycle?: (sourceCycle: number) => number | undefined;
}

/** Geometry-owned construction of immutable, screen-local semantic snap candidates. */
export class SemanticSnapCandidateService {
  #builds = 0;
  #candidateCount = 0;

  build(input: SemanticSnapGeometryInput): ImmutableSnapIndex {
    const candidates: SnapCandidate[] = [];
    const sources: SnapCandidateSource[] = [];
    const renderedCycleCount = input.renderedCycleCount ?? input.document.timeline.cycleCount;
    const sourceCycleForRenderedCycle = input.sourceCycleForRenderedCycle ?? ((cycle: number) => cycle);
    const renderedCycleForSourceCycle = input.renderedCycleForSourceCycle ?? ((cycle: number) => cycle);
    const visibleSignalIds = new Set(input.document.signals.filter((signal) => signal.type !== "commentRow" && signal.display.visible !== false).map((signal) => signal.id));
    const resolve = (anchor: SemanticAnchor): Point | undefined => {
      const signalId = anchor.signalId ?? input.axisOwnerSignalId ?? input.document.timeline.referenceClock;
      if (!signalId) return undefined;
      if (anchor.signalId !== undefined && !visibleSignalIds.has(anchor.signalId)) return undefined;
      if (!input.rowY.has(signalId)) return undefined;
      const renderedCycle = anchor.cycle === input.document.timeline.cycleCount ? renderedCycleCount : renderedCycleForSourceCycle(anchor.cycle);
      if (renderedCycle === undefined) return undefined;
      // Local geometry maps retain canonical source-cycle keys even when the
      // display mapping compresses folded cycles. The display cycle is only
      // used to select the rendered boundary; feeding it back into the map
      // would resolve a later source boundary to an earlier one after a fold.
      const local = input.geometryMaps.get(signalId)?.find({ ...anchor, signalId, cycle: anchor.cycle });
      return local ? { x: local.point.x, y: (input.rowY.get(signalId) ?? 0) + local.point.y } : undefined;
    };
    for (const signal of input.document.signals) {
      if (signal.type === "commentRow" || signal.display.visible === false || !input.rowY.has(signal.id)) continue;
      const map = input.geometryMaps.get(signal.id);
      if (!map) continue;
      const y = input.rowY.get(signal.id) ?? 0;
      // Geometry maps may retain only the currently rendered source interval.
      // Enumerate those semantic boundaries directly instead of scanning the
      // entire document display range and probing `find()` for absent cycles.
      // Keep the display-range fallback for third-party maps that do not yet
      // expose their bounded boundary index.
      const boundaryEntries = map.cycleBoundaryEntries?.();
      const eligibleBoundaryEntries = boundaryEntries?.filter((entry) => renderedCycleForSourceCycle(entry.cycle) !== undefined || entry.cycle === input.document.timeline.cycleCount);
      const regularSource = eligibleBoundaryEntries && createRegularCycleSnapSource(signal.id, signal.type, y, map, eligibleBoundaryEntries, input.document.timeline.cycleCount);
      if (regularSource) sources.push(regularSource);
      if (regularSource) continue;
      const sourceCycles = boundaryEntries === undefined || boundaryEntries.length === 0
        ? Array.from({ length: renderedCycleCount + 1 }, (_, renderedCycle) => sourceCycleForRenderedCycle(renderedCycle))
        : boundaryEntries.map((entry) => entry.cycle);
      for (const cycle of sourceCycles) {
        if (cycle === undefined || renderedCycleForSourceCycle(cycle) === undefined && cycle !== input.document.timeline.cycleCount) continue;
        const points: readonly { readonly point: AnchorPoint; readonly kind: SnapKind }[] = [
          { point: "cycle-start", kind: "cycle-boundary" },
          ...(cycle === input.document.timeline.cycleCount ? [] : [{ point: "cycle-center" as const, kind: "cycle-center" as const }]),
          ...(cycle === input.document.timeline.cycleCount ? [] : [{ point: "transition-center" as const, kind: signal.type === "bus" || signal.type === "state" ? "bus-transition" as const : "signal-transition" as const }]),
          ...(cycle === input.document.timeline.cycleCount ? [] : [{ point: "value-start" as const, kind: "value-boundary" as const }, { point: "value-center" as const, kind: "value-boundary" as const }, { point: "row-center" as const, kind: "signal-row" as const }, ...(signal.type === "clock" ? [{ point: "rising-edge" as const, kind: "clock-edge" as const }, { point: "falling-edge" as const, kind: "clock-edge" as const }] : [])]),
        ];
        for (const item of points) {
          const anchor: SemanticAnchor = { signalId: signal.id, cycle, point: item.point };
          const local = map.find({ ...anchor, cycle });
          if (local) candidates.push({ kind: item.kind, anchor, point: { x: local.point.x, y: y + local.point.y }, ownerId: signal.id });
        }
      }
    }
    this.#appendOwners(candidates, input.document.bookmarks, input.document.annotations, resolve);
    this.#builds += 1;
    this.#candidateCount = candidates.length;
    return new ImmutableSnapIndex(candidates, sources);
  }

  metrics(): Readonly<{ builds: number; candidateCount: number }> {
    return Object.freeze({ builds: this.#builds, candidateCount: this.#candidateCount });
  }

  #appendOwners(candidates: SnapCandidate[], bookmarks: readonly Bookmark[], annotations: readonly Annotation[], resolve: (anchor: SemanticAnchor) => Point | undefined): void {
    for (const bookmark of bookmarks) {
      const anchor: SemanticAnchor = { cycle: bookmark.start, point: "cycle-start" };
      const point = resolve(anchor);
      if (point) candidates.push({ kind: "marker", anchor, point, ownerId: bookmark.id });
    }
    for (const annotation of annotations) for (const field of ["anchor", "start", "end", "from", "to"] as const) {
      const anchor = annotation[field];
      const point = anchor && resolve(anchor);
      if (anchor && point) candidates.push({ kind: "annotation", anchor, point, ownerId: annotation.id });
    }
  }
}

function createRegularCycleSnapSource(signalId: SignalId, signalType: string, rowY: number, map: LocalGeometryMap, entries: readonly LocalGeometryEntry[], terminalCycle: number): SnapCandidateSource | undefined {
  if (entries.length < 2) return undefined;
  const step = entries[1]!.position.x - entries[0]!.position.x;
  if (!Number.isFinite(step) || step <= 0 || entries[1]!.cycle !== entries[0]!.cycle + 1) return undefined;
  for (let index = 2; index < entries.length; index += 1) {
    if (entries[index]!.cycle !== entries[index - 1]!.cycle + 1 || Math.abs((entries[index]!.position.x - entries[index - 1]!.position.x) - step) > 1e-6) return undefined;
  }
  const lowerBound = (x: number): number => {
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (entries[middle]!.position.x < x) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return {
    candidatesNear(point, tolerance) {
      const first = Math.max(0, lowerBound(point.x - tolerance) - 1);
      const last = Math.min(entries.length - 1, lowerBound(point.x + tolerance));
      const result: SnapCandidate[] = [];
      for (let index = first; index <= last; index += 1) {
        const boundary = entries[index]!;
        const terminal = boundary.cycle === terminalCycle;
        const points: readonly { readonly point: AnchorPoint; readonly kind: SnapKind }[] = [
          { point: "cycle-start", kind: "cycle-boundary" },
          ...(terminal ? [] : [{ point: "cycle-center" as const, kind: "cycle-center" as const }]),
          ...(terminal ? [] : [{ point: "transition-center" as const, kind: signalType === "bus" || signalType === "state" ? "bus-transition" as const : "signal-transition" as const }]),
          ...(terminal ? [] : [{ point: "value-start" as const, kind: "value-boundary" as const }, { point: "value-center" as const, kind: "value-boundary" as const }, { point: "row-center" as const, kind: "signal-row" as const }, ...(signalType === "clock" ? [{ point: "rising-edge" as const, kind: "clock-edge" as const }, { point: "falling-edge" as const, kind: "clock-edge" as const }] : [])]),
        ];
        for (const item of points) {
          const anchor: SemanticAnchor = { signalId, cycle: boundary.cycle, point: item.point };
          const local = map.find(anchor);
          if (local && Math.abs(local.point.x - point.x) <= tolerance) result.push({ kind: item.kind, anchor, point: { x: local.point.x, y: rowY + local.point.y }, ownerId: signalId });
        }
      }
      return result;
    },
    neighborsByX(x, kind) {
      if (kind !== "cycle-boundary") return Object.freeze({});
      const atOrBefore = (value: number): number => {
        let low = 0;
        let high = entries.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (entries[middle]!.position.x <= value) low = middle + 1;
          else high = middle;
        }
        return low - 1;
      };
      const candidateAt = (index: number): SnapCandidate | undefined => {
        const boundary = entries[index];
        if (!boundary) return undefined;
        const anchor: SemanticAnchor = { signalId, cycle: boundary.cycle, point: "cycle-start" };
        const local = map.find(anchor);
        return local ? { kind: "cycle-boundary", anchor, point: { x: local.point.x, y: rowY + local.point.y }, ownerId: signalId } : undefined;
      };
      const beforeIndex = atOrBefore(x);
      const atOrAfterIndex = beforeIndex >= 0 && entries[beforeIndex]!.position.x === x ? beforeIndex : beforeIndex + 1;
      const before = candidateAt(beforeIndex);
      const after = candidateAt(atOrAfterIndex);
      return Object.freeze({
        ...(before ? { before } : {}),
        ...(after ? { after } : {}),
      });
    },
  };
}
export * from "./uniform-cycle-geometry.js";

/** Annotation label layout constants/wrapping are data-only presentation helpers owned by schema; the renderer reaches them through
 * geometry so `renderer` keeps no direct schema dependency (architecture/packages.json). */
export { ANNOTATION_LABEL_LINE_HEIGHT, ANNOTATION_LABEL_MAX_WIDTH, wrapAnnotationLabel } from "@timing-chart-v2/schema";
