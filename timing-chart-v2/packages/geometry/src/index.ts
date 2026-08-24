import type { AnchorPoint, Annotation, Bookmark, CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

export interface Point { readonly x: number; readonly y: number }
export interface ViewTransform { readonly scrollX: number; readonly scrollY: number; readonly zoom: number }

export interface LocalAnchorGeometry {
  readonly signalId: SignalId;
  readonly anchor: SemanticAnchor;
  readonly point: Point;
}

export interface LocalGeometryMap {
  readonly signalId: SignalId;
  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined;
}

export interface LocalGeometryEntry {
  readonly cycle: number;
  readonly point: AnchorPoint;
  readonly position: Point;
}

const keyOf = (cycle: number, point: AnchorPoint): string => `${cycle}:${point}`;

export class ImmutableLocalGeometryMap implements LocalGeometryMap {
  readonly signalId: SignalId;
  readonly #entries: ReadonlyMap<string, Point>;

  constructor(signalId: SignalId, entries: readonly LocalGeometryEntry[]) {
    this.signalId = signalId;
    this.#entries = new Map(entries.map((entry) => [keyOf(entry.cycle, entry.point), Object.freeze({ ...entry.position })]));
  }

  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined {
    if (anchor.signalId !== this.signalId) return undefined;
    const base = this.#entries.get(keyOf(anchor.cycle, anchor.point));
    if (!base) return undefined;
    const point = Object.freeze({ x: base.x + (anchor.offset?.x ?? 0), y: base.y + (anchor.offset?.y ?? 0) });
    return Object.freeze({ signalId: this.signalId, anchor, point });
  }
}

export interface ScreenGeometryProjector {
  toScreen(local: LocalAnchorGeometry, transform: ViewTransform): Point;
}

export class DefaultScreenGeometryProjector implements ScreenGeometryProjector {
  toScreen(local: LocalAnchorGeometry, transform: ViewTransform): Point {
    if (!Number.isFinite(transform.zoom) || transform.zoom <= 0) throw new Error("Screen Geometry zoom must be positive and finite.");
    return Object.freeze({
      x: (local.point.x - transform.scrollX) * transform.zoom,
      y: (local.point.y - transform.scrollY) * transform.zoom,
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

export class ImmutableSnapIndex {
  readonly #candidates: readonly SnapCandidate[];

  constructor(candidates: readonly SnapCandidate[]) {
    this.#candidates = Object.freeze(candidates.map((candidate) => Object.freeze({ ...candidate, anchor: Object.freeze({ ...candidate.anchor }), point: Object.freeze({ ...candidate.point }) })));
  }

  nearest(point: Point, tolerance: number, kinds?: readonly SnapKind[], preferredKinds?: readonly SnapKind[]): SnapResult | undefined {
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("Snap tolerance must be finite and non-negative.");
    const allowed = kinds ? new Set(kinds) : undefined;
    let result: SnapResult | undefined;
    for (const candidate of this.#candidates) {
      if (allowed && !allowed.has(candidate.kind)) continue;
      const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
      if (distance > tolerance || (result && (distance > result.distance || (distance === result.distance && queryPriority(candidate.kind, preferredKinds) <= queryPriority(result.kind, preferredKinds))))) continue;
      result = Object.freeze({ ...candidate, distance });
    }
    return result;
  }

  entries(): readonly SnapCandidate[] {
    return this.#candidates;
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
}

/** Geometry-owned construction of immutable, screen-local semantic snap candidates. */
export class SemanticSnapCandidateService {
  #builds = 0;
  #candidateCount = 0;

  build(input: SemanticSnapGeometryInput): ImmutableSnapIndex {
    const candidates: SnapCandidate[] = [];
    const resolve = (anchor: SemanticAnchor): Point | undefined => {
      const signalId = anchor.signalId ?? input.document.timeline.referenceClock;
      if (!signalId) return undefined;
      if (!input.rowY.has(signalId)) return undefined;
      const local = input.geometryMaps.get(signalId)?.find({ ...anchor, signalId });
      return local ? { x: local.point.x, y: (input.rowY.get(signalId) ?? 0) + local.point.y } : undefined;
    };
    for (const signal of input.document.signals) {
      if (signal.type === "commentRow" || signal.display.visible === false || !input.rowY.has(signal.id)) continue;
      const map = input.geometryMaps.get(signal.id);
      if (!map) continue;
      const y = input.rowY.get(signal.id) ?? 0;
      for (let cycle = 0; cycle < input.document.timeline.cycleCount; cycle += 1) {
        const points: readonly { readonly point: AnchorPoint; readonly kind: SnapKind }[] = [
          { point: "cycle-start", kind: "cycle-boundary" },
          { point: "cycle-center", kind: "cycle-center" },
          { point: "cycle-center", kind: "signal-row" },
          { point: "transition-center", kind: signal.type === "bus" || signal.type === "state" ? "bus-transition" : "signal-transition" },
          { point: "value-start", kind: "value-boundary" },
          { point: "value-center", kind: "value-boundary" },
          { point: "row-center", kind: "signal-row" },
          ...(signal.type === "clock" ? [{ point: "rising-edge" as const, kind: "clock-edge" as const }, { point: "falling-edge" as const, kind: "clock-edge" as const }] : []),
        ];
        for (const item of points) {
          const anchor: SemanticAnchor = { signalId: signal.id, cycle, point: item.point };
          const local = map.find(anchor);
          if (local) candidates.push({ kind: item.kind, anchor, point: { x: local.point.x, y: y + local.point.y }, ownerId: signal.id });
        }
      }
    }
    this.#appendOwners(candidates, input.document.bookmarks, input.document.annotations, resolve);
    this.#builds += 1;
    this.#candidateCount = candidates.length;
    return new ImmutableSnapIndex(candidates);
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
