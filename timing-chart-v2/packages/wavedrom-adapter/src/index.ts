import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";

export interface CanonicalSignalSource {
  readonly id: SignalId;
  readonly cycleCount: number;
}

export interface WaveJsonSignal {
  readonly name?: string;
  readonly wave: string;
  readonly data?: readonly string[];
  readonly period?: number;
  readonly phase?: number;
}

export interface RenderedWave {
  readonly signalId: SignalId;
  readonly ownerKey: SignalId;
  readonly svg: SVGElement;
}

export interface WaveDromAdapter {
  toWaveJson(signal: CanonicalSignalSource): WaveJsonSignal;
  renderWave(signalId: SignalId, waveJson: WaveJsonSignal, mount: Element): Promise<RenderedWave>;
  extractLocalGeometry(rendered: RenderedWave): LocalGeometryMap;
  dispose(signalId: SignalId): void;
}
