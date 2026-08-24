import type { RenderProjection } from "@timing-chart-v2/projection";

export interface RenderCounters {
  readonly waveDromRenders: number;
  readonly localGeometryBuilds: number;
  readonly rowPositionUpdates: number;
  readonly overlayUpdates: number;
}

export interface TimingChartRenderer {
  mount(host: HTMLElement): void;
  update(projection: RenderProjection): void;
  counters(): Readonly<RenderCounters>;
  dispose(): void;
}
