import { StableTimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";

/** Owns the imperative renderer's DOM lifecycle outside React composition. */
export class RenderCoordinator {
  readonly renderer: StableTimingChartRenderer;

  constructor(provider: WaveformSurfaceProvider) {
    this.renderer = new StableTimingChartRenderer(provider);
  }

  mount(host: HTMLElement): void {
    this.renderer.mount(host);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
