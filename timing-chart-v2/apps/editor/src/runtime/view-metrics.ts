export interface ViewMetrics {
  readonly leftPaneWidth: number;
  readonly frozenPaneWidth: number;
  readonly inspectorWidth: number;
  readonly viewportWidth: number;
  readonly zoom: number;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export class ViewMetricsOwner {
  #current: ViewMetrics;

  constructor(initial: ViewMetrics) {
    this.#current = Object.freeze({ ...initial });
  }

  update(next: Partial<ViewMetrics>): void {
    this.#current = Object.freeze({
      ...this.#current,
      ...next,
      leftPaneWidth: finitePositive(next.leftPaneWidth ?? this.#current.leftPaneWidth, this.#current.leftPaneWidth),
      frozenPaneWidth: finitePositive(next.frozenPaneWidth ?? this.#current.frozenPaneWidth, this.#current.frozenPaneWidth),
      inspectorWidth: finitePositive(next.inspectorWidth ?? this.#current.inspectorWidth, this.#current.inspectorWidth),
      viewportWidth: Math.max(0, Number.isFinite(next.viewportWidth ?? this.#current.viewportWidth) ? next.viewportWidth ?? this.#current.viewportWidth : this.#current.viewportWidth),
      zoom: finitePositive(next.zoom ?? this.#current.zoom, this.#current.zoom),
    });
  }

  snapshot(): ViewMetrics {
    return this.#current;
  }
}
