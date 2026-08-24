import type { AnchorPoint, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

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
