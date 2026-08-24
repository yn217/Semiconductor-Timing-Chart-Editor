import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { Signal, SignalId } from "@timing-chart-v2/schema";

export const WAVEDROM_VERSION = "3.6.2" as const;
export const WAVEDROM_STATE_TOKENS = ["0", "1", "x", "z", "d", "u"] as const;
export const WAVEDROM_CLOCK_TOKENS = ["p", "n"] as const;
export const WAVEDROM_DATA_TOKEN = "=" as const;
export const WAVEDROM_UNSUPPORTED_CAPABILITIES = [
  { capability: "data-color-tokens-2-through-9", reason: "Canonical Signal has no persisted WaveDrom color-token semantic." },
  { capability: "active-edge-clock-tokens-P-and-N", reason: "Canonical Clock has no active-edge-marker semantic." },
  { capability: "non-50-percent-clock-duty", reason: "Pinned WaveDrom clock primitives cannot preserve arbitrary duty geometry." },
  { capability: "fractional-per-signal-change-points", reason: "WaveDrom phase transforms a lane; it cannot place independent fractional changes exactly." },
  { capability: "sub-half-cycle-clock-phase", reason: "The pinned WaveDrom brick model cannot expose exact Geometry Map ownership below half-cycle phase increments." },
] as const;

export interface CanonicalSignalSource {
  readonly signal: Signal;
  readonly cycleCount: number;
  /** Derived timeline-gap positions. Each position replaces a continuation slot. */
  readonly gapCycles?: readonly number[];
}

export interface WaveJsonSignal {
  readonly wave: string;
  readonly data?: readonly string[];
  readonly period?: number;
  readonly phase?: number;
}

export interface RenderedWave {
  readonly signalId: SignalId;
  readonly ownerKey: SignalId;
  readonly svg: SVGElement;
  readonly renderIndex: number;
  readonly waveJson: WaveJsonSignal;
}

export interface WaveDromAdapterMetrics {
  readonly renderCalls: number;
  readonly geometryBuilds: number;
  readonly geometryMatrixReads: number;
  readonly activeOwners: number;
  readonly allocatedRenderIndices: number;
}

export interface WaveDromAdapter {
  toWaveJson(source: CanonicalSignalSource): WaveJsonSignal;
  renderWave(signalId: SignalId, waveJson: WaveJsonSignal, mount: Element): Promise<RenderedWave>;
  extractLocalGeometry(rendered: RenderedWave): LocalGeometryMap;
  dispose(signalId: SignalId): void;
  metrics(): WaveDromAdapterMetrics;
}

export class WaveDromAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WaveDromAdapterError";
    this.code = code;
  }
}
