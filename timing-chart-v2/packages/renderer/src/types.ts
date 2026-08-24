import type { RenderProjection } from "@timing-chart-v2/projection";

export type WaveSignalId = RenderProjection["mountedSignalIds"][number];

export interface WaveMountResult {
  readonly waveDromRenders: number;
  readonly localGeometryBuilds: number;
}

export interface WaveformSurfaceProvider {
  mountWave(signalId: WaveSignalId, owner: HTMLElement): Promise<WaveMountResult>;
  disposeWave(signalId: WaveSignalId): void;
}

export interface RenderCounters {
  readonly waveDromRenders: number;
  readonly localGeometryBuilds: number;
  readonly rowPositionUpdates: number;
  readonly overlayUpdates: number;
}

export interface OverlayAnchorPoint {
  readonly field: "anchor" | "start" | "end" | "from" | "to";
  readonly x: number;
  readonly y: number;
}

export interface AnnotationOverlayPrimitive {
  readonly id: string;
  readonly type: string;
  readonly shape: "point" | "line" | "range" | "vertical";
  readonly label: string;
  readonly visible: boolean;
  readonly color?: string;
  readonly anchors: readonly OverlayAnchorPoint[];
  readonly labelOffset?: Readonly<{ x: number; y: number }>;
  readonly lineType?: "straight" | "orthogonal" | "curve" | "diagonal";
  readonly arrowhead?: "end" | "start" | "bidirectional" | "none";
  readonly surfaceHeight: number;
}

export interface SnapGuidePrimitive {
  readonly x: number;
  readonly y: number;
  readonly rowY: number;
  readonly rowHeight: number;
  readonly surfaceHeight: number;
  readonly label: string;
}

export interface EdgeCounterOverlayPrimitive {
  readonly id: string;
  readonly signalId: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

export interface TimingChartRenderer {
  mount(host: HTMLElement): void;
  update(projection: RenderProjection): void;
  updateOverlays(primitives: readonly AnnotationOverlayPrimitive[]): void;
  updateSnapGuide(guide?: SnapGuidePrimitive): void;
  updateEdgeCounters(primitives: readonly EdgeCounterOverlayPrimitive[]): void;
  counters(): Readonly<RenderCounters>;
  dispose(): void;
}
