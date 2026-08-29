import type { RenderProjection } from "@timing-chart-v2/projection";

export type WaveSignalId = RenderProjection["mountedSignalIds"][number];

export interface WaveMountResult {
  readonly waveDromRenders: number;
  readonly localGeometryBuilds: number;
}

export interface WaveMountRequest {
  readonly signalId: WaveSignalId;
  readonly owner: HTMLElement;
}

export interface WaveMountBatchItem {
  readonly signalId: WaveSignalId;
  readonly result?: WaveMountResult;
  readonly error?: unknown;
}

export interface WaveformSurfaceProvider {
  mountWave(signalId: WaveSignalId, owner: HTMLElement): Promise<WaveMountResult>;
  /** Optional two-phase hook: all requested mounts must complete before any geometry reads. */
  mountWaveBatch?(requests: readonly WaveMountRequest[]): Promise<readonly WaveMountBatchItem[]>;
  disposeWave(signalId: WaveSignalId): void;
}

export interface RenderCounters {
  readonly waveDromRenders: number;
  readonly localGeometryBuilds: number;
  readonly rowPositionUpdates: number;
  readonly overlayUpdates: number;
}

export interface RendererDiagnostics {
  readonly projectionUpdates: number;
  readonly mountedRows: number;
  readonly mountedWaveOwners: number;
  readonly cachedWaveOwners: number;
  readonly waveOwnerCacheLimit: number;
  readonly domNodeCreates: number;
  readonly domNodeDestroys: number;
  readonly domNodeMoves: number;
  readonly waveArtifactCacheHits: number;
  readonly waveArtifactCacheMisses: number;
  readonly waveArtifactDisposals: number;
  readonly waveRendersBySignal: Readonly<Record<string, number>>;
  readonly localGeometryBuildsBySignal: Readonly<Record<string, number>>;
  readonly annotationResolvePasses: number;
  readonly resolvedAnnotations: number;
}

export interface OverlayAnchorPoint {
  readonly field: "anchor" | "start" | "end" | "from" | "to";
  readonly x: number;
  readonly y: number;
  readonly threshold?: number;
}

export interface AnnotationOverlayPrimitive {
  readonly id: string;
  readonly type: string;
  readonly shape: "point" | "line" | "range" | "vertical" | "trace";
  readonly label: string;
  readonly visible: boolean;
  readonly color?: string;
  readonly opacity?: number;
  readonly sourceSignalId?: string;
  readonly traceOffsetCycles?: number;
  readonly anchors: readonly OverlayAnchorPoint[];
  readonly labelOffset?: Readonly<{ x: number; y: number }>;
  readonly lineType?: "straight" | "orthogonal" | "curve" | "diagonal";
  readonly arrowhead?: "end" | "start" | "bidirectional" | "none";
  readonly surfaceHeight: number;
  readonly tracePoints?: readonly Point[];
}

export interface Point { readonly x: number; readonly y: number }

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
  diagnostics(): Readonly<RendererDiagnostics>;
  dispose(): void;
}
