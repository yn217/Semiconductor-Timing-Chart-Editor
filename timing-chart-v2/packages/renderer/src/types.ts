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
  readonly waveBatchCount: number;
  readonly waveBatchFrameYields: number;
  readonly waveBatchMaxSize: number;
  readonly waveBatchPending: number;
  /** Number of row entries inspected during the latest renderer update. */
  readonly rowsVisited: number;
  /** Full row-layout traversals; ordinary viewport updates must keep this at zero. */
  readonly fullRowScans: number;
  readonly waveRendersBySignalCount: number;
  readonly localGeometryBuildsBySignalCount: number;
  readonly documentEpoch: number;
  readonly rowYSize: number;
  readonly rowYStaleCount: number;
  readonly rowYPrunePasses: number;
  readonly dirtyWaveSize: number;
  readonly waveVersionSize: number;
  readonly fullReplaceEpochResets: number;
  readonly diagnosticMapPrunePasses: number;
  /** Number of hot-path diagnostic payload serializations published to the DOM. */
  readonly diagnosticSerializationCount: number;
  /** Total UTF-8 bytes emitted for hot-path diagnostic payloads. */
  readonly diagnosticSerializationBytes: number;
  /** Cumulative time spent serializing hot-path diagnostic payloads. */
  readonly diagnosticSerializationDurationMs: number;
  /** Number of diagnostic JSON stringify operations published to the DOM. */
  readonly diagnosticStringifyCount: number;
  /** Cumulative time spent JSON stringifying hot-path diagnostic payloads. */
  readonly diagnosticStringifyDurationMs: number;
  /** Number of UTF-8 encoding measurements performed for diagnostics. */
  readonly diagnosticEncodingCount: number;
  /** Cumulative time spent measuring diagnostic payload bytes. */
  readonly diagnosticEncodingDurationMs: number;
  /** Number of diagnostic dataset publication operations. */
  readonly diagnosticPublishCount: number;
  /** Cumulative time spent publishing diagnostic dataset attributes. */
  readonly diagnosticPublishDurationMs: number;
}

export interface RendererRowIdentitySnapshot {
  readonly canonicalRowIds: readonly string[];
  readonly visibleRowIds: readonly string[];
}

export type RendererDiagnosticSummary = Omit<RendererDiagnostics, "waveRendersBySignal" | "localGeometryBuildsBySignal">;

export interface OverlayAnchorPoint {
  readonly field: "anchor" | "start" | "end" | "from" | "to";
  readonly x: number;
  readonly y: number;
  readonly threshold?: number;
  readonly transitionKind?: "threshold" | "ratio";
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
  /** Same untyped-JSON-object shape as RowLayoutEntry.displayStyle, kept
   * structural here (not imported from @timing-chart-v2/schema) -- renderer
   * intentionally has no dependency on the canonical schema package. */
  readonly style?: Readonly<Record<string, unknown>>;
  /** Degrees, additive on top of any anchor-derived angle already computed
   * for line-shaped overlays. */
  readonly rotation?: number;
  readonly align?: "left" | "center" | "right";
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
  rowIdentitySnapshot(): Readonly<RendererRowIdentitySnapshot>;
  diagnostics(): Readonly<RendererDiagnostics>;
  diagnosticSummary(): Readonly<RendererDiagnosticSummary>;
  dispose(): void;
}
