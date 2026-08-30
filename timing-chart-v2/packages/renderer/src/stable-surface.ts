import type { GroupHeaderLayoutEntry, RenderProjection, RowLayoutEntry } from "@timing-chart-v2/projection";
import type { AnnotationOverlayPrimitive, EdgeCounterOverlayPrimitive, RenderCounters, RendererDiagnosticSummary, RendererDiagnostics, RendererRowIdentitySnapshot, SnapGuidePrimitive, TimingChartRenderer, WaveformSurfaceProvider, WaveMountBatchItem, WaveMountRequest, WaveSignalId } from "./types.js";

const WAVE_BATCH_LIMIT = 8;
const diagnosticEncoder = new TextEncoder();

function nextBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else globalThis.setTimeout(resolve, 0);
  });
}

function createLeftTreeIcon(document: Document, name: "chevron-down" | "chevron-right" | "eye" | "eye-off" | "more" | "comment", className: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", className);
  svg.setAttribute("data-icon", name);
  svg.setAttribute("aria-hidden", "true");
  const append = (tag: "path" | "circle") => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    svg.append(element);
    return element;
  };
  if (name === "chevron-down" || name === "chevron-right") {
    const path = append("path");
    path.setAttribute("d", name === "chevron-down" ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
  } else if (name === "eye" || name === "eye-off") {
    const path = append("path");
    path.setAttribute("d", name === "eye" ? "M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" : "M3 3l18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.5M6.2 7.8C3.6 9.4 2 12 2 12s4 6 10 6a10.8 10.8 0 0 0 2.5-.3");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (name === "eye") {
      const pupil = append("circle");
      pupil.setAttribute("cx", "12");
      pupil.setAttribute("cy", "12");
      pupil.setAttribute("r", "2.5");
      pupil.setAttribute("fill", "none");
      pupil.setAttribute("stroke", "currentColor");
      pupil.setAttribute("stroke-width", "1.6");
    }
  } else if (name === "more") {
    for (const cy of [5, 12, 19]) {
      const dot = append("circle");
      dot.setAttribute("cx", "12");
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "1.8");
      dot.setAttribute("fill", "currentColor");
    }
  } else if (name === "comment") {
    const path = append("path");
    path.setAttribute("d", "M4 4h16v12H9l-5 4z");
    path.setAttribute("fill", "#f1dcff");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
  }
  return svg;
}

function createRoleBadge(document: Document, kind: RowLayoutEntry["kind"], role: RowLayoutEntry["role"], className: string): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.dataset.role = className === "tree-signal-role" ? "tree-signal-role" : "signal-role";
  badge.dataset.presentation = kind === "comment" ? "comment" : role ?? "internal";
  badge.className = className;
  if (kind === "comment") {
    badge.append(createLeftTreeIcon(document, "comment", "surface-icon comment-icon"));
  } else {
    badge.textContent = role === "input" ? "i" : role === "output" ? "o" : "wire";
  }
  return badge;
}

interface Layers {
  readonly root: HTMLElement;
  readonly left: HTMLElement;
  readonly frozen: HTMLElement;
  readonly timing: HTMLElement;
  readonly waves: HTMLElement;
  readonly overlays: HTMLElement;
  readonly interactive: HTMLElement;
}

export class StableTimingChartRenderer implements TimingChartRenderer {
  readonly #provider: WaveformSurfaceProvider;
  readonly #leftRows = new Map<string, HTMLElement>();
  readonly #frozenRows = new Map<string, HTMLElement>();
  readonly #timingRows = new Map<string, HTMLElement>();
  readonly #leftGroupHeaders = new Map<string, HTMLElement>();
  readonly #frozenGroupHeaders = new Map<string, HTMLElement>();
  readonly #timingGroupHeaders = new Map<string, HTMLElement>();
  readonly #waveOwners = new Map<WaveSignalId, HTMLElement>();
  readonly #overlayOwners = new Map<string, HTMLElement>();
  readonly #overlaySignatures = new Map<string, string>();
  readonly #edgeCounterOwners = new Map<string, HTMLElement>();
  readonly #dirtyWaves = new Set<WaveSignalId>();
  readonly #waveVersions = new Map<WaveSignalId, number>();
  readonly #wavePending = new Set<WaveSignalId>();
  readonly #waveQueue = new Map<WaveSignalId, { readonly owner: HTMLElement; readonly version: number }>();
  readonly #waveRendersBySignal = new Map<WaveSignalId, number>();
  readonly #localGeometryBuildsBySignal = new Map<WaveSignalId, number>();
  #waveBatchScheduled = false;
  #waveBatchSequence = 0;
  readonly #rowY = new Map<string, number>();
  #canonicalSignalIdsSource: readonly WaveSignalId[] | undefined;
  #canonicalSignalIdSet = new Set<WaveSignalId>();
  #documentRowIdsSource: readonly string[] | undefined;
  #visibleRowIdsSource: readonly string[] | undefined;
  #documentEpoch = 0;
  #rowYPrunePasses = 0;
  #fullReplaceEpochResets = 0;
  #diagnosticMapPrunePasses = 0;
  #rowLayoutSource: readonly RowLayoutEntry[] | undefined;
  #rowIndex = new Map<string, RowLayoutEntry>();
  #navigationRowLayoutSource: readonly RowLayoutEntry[] | undefined;
  #navigationRowIndex = new Map<string, RowLayoutEntry>();
  readonly #pending = new Set<Promise<void>>();
  #layers: Layers | undefined;
  #counters: RenderCounters = { waveDromRenders: 0, localGeometryBuilds: 0, rowPositionUpdates: 0, overlayUpdates: 0 };
  #diagnostics: RendererDiagnostics = { projectionUpdates: 0, mountedRows: 0, mountedWaveOwners: 0, cachedWaveOwners: 0, waveOwnerCacheLimit: 32, domNodeCreates: 0, domNodeDestroys: 0, domNodeMoves: 0, waveArtifactCacheHits: 0, waveArtifactCacheMisses: 0, waveArtifactDisposals: 0, waveRendersBySignal: {}, localGeometryBuildsBySignal: {}, annotationResolvePasses: 0, resolvedAnnotations: 0, waveBatchCount: 0, waveBatchFrameYields: 0, waveBatchMaxSize: 0, waveBatchPending: 0, rowsVisited: 0, fullRowScans: 0, waveRendersBySignalCount: 0, localGeometryBuildsBySignalCount: 0, documentEpoch: 0, rowYSize: 0, rowYStaleCount: 0, rowYPrunePasses: 0, dirtyWaveSize: 0, waveVersionSize: 0, fullReplaceEpochResets: 0, diagnosticMapPrunePasses: 0, diagnosticSerializationCount: 0, diagnosticSerializationBytes: 0, diagnosticSerializationDurationMs: 0, diagnosticStringifyCount: 0, diagnosticStringifyDurationMs: 0, diagnosticEncodingCount: 0, diagnosticEncodingDurationMs: 0, diagnosticPublishCount: 0, diagnosticPublishDurationMs: 0 };

  constructor(provider: WaveformSurfaceProvider) {
    this.#provider = provider;
  }

  mount(host: HTMLElement): void {
    if (this.#layers) throw new Error("Timing chart renderer is already mounted.");
    const root = element(host, "div", "timing-chart-surface");
    const left = element(host, "div", "left-tree-rows");
    const frozen = element(host, "div", "frozen-label-rows");
    const timing = element(host, "div", "timing-semantic-rows");
    const waves = element(host, "div", "stable-waveform-surface");
    const overlays = element(host, "div", "annotation-overlay-surface");
    const interactive = element(host, "div", "interactive-overlay-surface");
    left.setAttribute("role", "tree");
    left.setAttribute("aria-label", "Signals and Groups");
    left.tabIndex = 0;
    for (const layer of [left, frozen, timing, waves, overlays, interactive]) root.append(layer);
    host.replaceChildren(root);
    this.#layers = { root, left, frozen, timing, waves, overlays, interactive };
    Object.defineProperty(root, "requestPerformanceSnapshot", { configurable: true, value: () => this.diagnostics() });
    Object.defineProperty(root, "requestRowIdentitySnapshot", { configurable: true, value: () => this.rowIdentitySnapshot() });
    this.#publishCounters();
  }

  update(projection: RenderProjection): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before update.");
    assertCrossSurfaceInvariant(projection);
    this.#diagnostics = { ...this.#diagnostics, projectionUpdates: this.#diagnostics.projectionUpdates + 1, mountedRows: projection.mountedRowIds.length };
    const rows = this.#indexedRows(projection.rowLayout, false);
    const navigationRows = this.#indexedRows(projection.navigationRowLayout, true);
    const documentRowIdsChanged = this.#documentRowIdsSource !== projection.canonicalRowIds;
    if (documentRowIdsChanged) {
      this.#documentRowIdsSource = projection.canonicalRowIds;
      const currentIds = new Set<string>(projection.canonicalRowIds);
      for (const rowId of this.#rowY.keys()) if (!currentIds.has(rowId)) this.#rowY.delete(rowId);
      this.#rowYPrunePasses += 1;
    }
    const changedRows = new Set<string>();
    const visitedRowIds = new Set([...projection.leftRowIds, ...projection.frozenLabelRowIds, ...projection.timingRowIds]);
    for (const rowId of visitedRowIds) {
      const row = rows.get(rowId) ?? navigationRows.get(rowId);
      if (!row) continue;
      if (this.#rowY.get(row.rowId) !== row.y) changedRows.add(row.rowId);
      this.#rowY.set(row.rowId, row.y);
    }
    this.#diagnostics = { ...this.#diagnostics, rowsVisited: visitedRowIds.size, documentEpoch: this.#documentEpoch, rowYSize: this.#rowY.size, rowYStaleCount: 0, rowYPrunePasses: this.#rowYPrunePasses };
    this.#counters = { ...this.#counters, rowPositionUpdates: this.#counters.rowPositionUpdates + changedRows.size };
    const shellStats = [syncShellLayer(layers.left, this.#leftRows, projection.leftRowIds, navigationRows, "left"), syncShellLayer(layers.frozen, this.#frozenRows, projection.frozenLabelRowIds, rows, "frozen"), syncShellLayer(layers.timing, this.#timingRows, projection.timingRowIds, rows, "timing")];
    const headerStats = [syncGroupHeaderLayer(layers.left, this.#leftGroupHeaders, projection.mountedLeftGroupHeaderIds, projection.leftGroupHeaders, "left"), syncGroupHeaderLayer(layers.frozen, this.#frozenGroupHeaders, projection.mountedGroupHeaderIds, projection.groupHeaders, "frozen"), syncGroupHeaderLayer(layers.timing, this.#timingGroupHeaders, projection.mountedGroupHeaderIds, projection.groupHeaders, "timing")];
    this.#diagnostics = { ...this.#diagnostics, domNodeCreates: this.#diagnostics.domNodeCreates + shellStats.concat(headerStats).reduce((sum, item) => sum + item.creates, 0), domNodeDestroys: this.#diagnostics.domNodeDestroys + shellStats.concat(headerStats).reduce((sum, item) => sum + item.destroys, 0), domNodeMoves: this.#diagnostics.domNodeMoves + shellStats.concat(headerStats).reduce((sum, item) => sum + item.moves, 0) };
    layers.root.style.height = `${projection.totalHeight}px`;
    layers.root.dataset.revision = String(projection.revision);
    if (this.#visibleRowIdsSource !== projection.visibleRowIds) {
      this.#visibleRowIdsSource = projection.visibleRowIds;
    }

    if (this.#canonicalSignalIdsSource !== projection.canonicalSignalIds) {
      this.#canonicalSignalIdsSource = projection.canonicalSignalIds;
      this.#canonicalSignalIdSet = new Set(projection.canonicalSignalIds);
    }
    const canonical = this.#canonicalSignalIdSet;
    const documentReplaced = projection.documentEpoch !== this.#documentEpoch;
    if (documentReplaced) {
      this.#documentEpoch = projection.documentEpoch;
      this.#fullReplaceEpochResets += 1;
      this.#dirtyWaves.clear();
      this.#waveVersions.clear();
      this.#diagnosticMapPrunePasses += 1;
      this.#waveRendersBySignal.clear();
      this.#localGeometryBuildsBySignal.clear();
      this.#diagnostics = { ...this.#diagnostics, waveRendersBySignalCount: 0, localGeometryBuildsBySignalCount: 0, diagnosticMapPrunePasses: this.#diagnosticMapPrunePasses };
      for (const [signalId, owner] of this.#waveOwners) {
        owner.remove();
        this.#provider.disposeWave(signalId);
        this.#waveOwners.delete(signalId);
        this.#diagnostics = { ...this.#diagnostics, domNodeDestroys: this.#diagnostics.domNodeDestroys + 1, waveArtifactDisposals: this.#diagnostics.waveArtifactDisposals + 1 };
      }
    }
    // A document replacement already clears the old owners and the isNew
    // mounted-owner path below queues the visible Signals. Do not pre-register
    // every offscreen canonical Signal; ordinary semantic invalidations still
    // use the projection's explicit waveSignalIds set.
    if (!documentReplaced) {
      for (const signalId of projection.waveSignalIds) {
        this.#dirtyWaves.add(signalId);
        this.#waveVersions.set(signalId, (this.#waveVersions.get(signalId) ?? 0) + 1);
      }
    }
    for (const [signalId, owner] of this.#waveOwners) {
      if (canonical.has(signalId)) continue;
      owner.remove();
      this.#provider.disposeWave(signalId);
      this.#waveOwners.delete(signalId);
      this.#dirtyWaves.delete(signalId);
      this.#waveVersions.delete(signalId);
      this.#wavePending.delete(signalId);
      this.#diagnostics = { ...this.#diagnostics, domNodeDestroys: this.#diagnostics.domNodeDestroys + 1, waveArtifactDisposals: this.#diagnostics.waveArtifactDisposals + 1 };
    }
    const mounted = new Set(projection.mountedSignalIds);
    const firstTimingRowByGroup = new Map<string, string>();
    for (const rowId of projection.timingRowIds) {
      const row = rows.get(rowId);
      if (row?.kind === "timing" && !firstTimingRowByGroup.has(row.groupId)) firstTimingRowByGroup.set(row.groupId, row.rowId);
    }
    for (const [signalId, owner] of this.#waveOwners) if (!mounted.has(signalId)) owner.remove();
    for (const signalId of projection.mountedSignalIds) {
      let owner = this.#waveOwners.get(signalId);
      const isNew = owner === undefined;
      if (!owner) {
        owner = element(layers.root.ownerDocument, "div", "wave-owner");
        owner.dataset.signalId = signalId;
        this.#waveOwners.set(signalId, owner);
        this.#diagnostics = { ...this.#diagnostics, domNodeCreates: this.#diagnostics.domNodeCreates + 1, waveArtifactCacheMisses: this.#diagnostics.waveArtifactCacheMisses + 1 };
      }
      if (!owner.isConnected) {
        if (!isNew) this.#diagnostics = { ...this.#diagnostics, waveArtifactCacheHits: this.#diagnostics.waveArtifactCacheHits + 1 };
        layers.waves.append(owner);
      }
      if (!isNew) { this.#waveOwners.delete(signalId); this.#waveOwners.set(signalId, owner); }
      const row = rows.get(signalId);
      if (row) {
        owner.dataset.groupId = row.groupId;
        owner.dataset.groupStart = String(firstTimingRowByGroup.get(row.groupId) === row.rowId);
        place(owner, row);
      }
      if (isNew || this.#dirtyWaves.has(signalId)) this.#queueWave(signalId, owner);
    }
    const waveOwnerCacheLimit = Math.max(32, mounted.size * 4);
    for (const [signalId, owner] of this.#waveOwners) {
      if (this.#waveOwners.size <= waveOwnerCacheLimit) break;
      if (mounted.has(signalId)) continue;
      owner.remove(); this.#provider.disposeWave(signalId); this.#waveOwners.delete(signalId); this.#dirtyWaves.delete(signalId); this.#waveVersions.delete(signalId); this.#wavePending.delete(signalId);
      this.#diagnostics = { ...this.#diagnostics, domNodeDestroys: this.#diagnostics.domNodeDestroys + 1, waveArtifactDisposals: this.#diagnostics.waveArtifactDisposals + 1 };
    }
    this.#diagnostics = { ...this.#diagnostics, mountedWaveOwners: [...this.#waveOwners.values()].filter((owner) => owner.isConnected).length, cachedWaveOwners: this.#waveOwners.size, waveOwnerCacheLimit, dirtyWaveSize: this.#dirtyWaves.size, waveVersionSize: this.#waveVersions.size, fullReplaceEpochResets: this.#fullReplaceEpochResets, diagnosticMapPrunePasses: this.#diagnosticMapPrunePasses };
    this.#publishCounters();
  }

  counters(): Readonly<RenderCounters> {
    return Object.freeze({ ...this.#counters });
  }

  rowIdentitySnapshot(): Readonly<RendererRowIdentitySnapshot> {
    return Object.freeze({
      canonicalRowIds: Object.freeze([...(this.#documentRowIdsSource ?? [])]),
      visibleRowIds: Object.freeze([...(this.#visibleRowIdsSource ?? [])]),
    });
  }

  diagnostics(): Readonly<RendererDiagnostics> {
    return Object.freeze({ ...this.#diagnostics, waveRendersBySignal: Object.fromEntries(this.#waveRendersBySignal), localGeometryBuildsBySignal: Object.fromEntries(this.#localGeometryBuildsBySignal) });
  }

  diagnosticSummary(): Readonly<RendererDiagnosticSummary> {
    const { waveRendersBySignal: _waveRendersBySignal, localGeometryBuildsBySignal: _localGeometryBuildsBySignal, ...summary } = this.#diagnostics;
    return Object.freeze(summary);
  }

  updateOverlays(primitives: readonly AnnotationOverlayPrimitive[]): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before overlay update.");
    this.#diagnostics = { ...this.#diagnostics, annotationResolvePasses: this.#diagnostics.annotationResolvePasses + 1, resolvedAnnotations: this.#diagnostics.resolvedAnnotations + primitives.length };
    const active = new Set(primitives.map((primitive) => primitive.id));
    let changes = 0;
    for (const [id, owner] of this.#overlayOwners) {
      if (active.has(id)) continue;
      owner.remove();
      this.#overlayOwners.delete(id);
      this.#overlaySignatures.delete(id);
      changes += 1;
    }
    for (const primitive of primitives) {
      const signature = JSON.stringify(primitive);
      let owner = this.#overlayOwners.get(primitive.id);
      if (!owner) {
        owner = element(layers.root.ownerDocument, "div", "annotation-owner");
        owner.dataset.annotationId = primitive.id;
        owner.tabIndex = 0;
        owner.setAttribute("role", "button");
        this.#overlayOwners.set(primitive.id, owner);
        layers.overlays.append(owner);
      }
      if (this.#overlaySignatures.get(primitive.id) === signature) continue;
      this.#overlaySignatures.set(primitive.id, signature);
      renderOverlay(owner, primitive);
      changes += 1;
    }
    if (changes > 0) this.#counters = { ...this.#counters, overlayUpdates: this.#counters.overlayUpdates + changes };
    this.#publishCounters();
  }

  updateSnapGuide(guide?: SnapGuidePrimitive): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before interactive overlay update.");
    if (!guide) {
      layers.interactive.replaceChildren();
      return;
    }
    const vertical = layers.root.ownerDocument.createElement("span");
    vertical.dataset.role = "snap-vertical-guide";
    vertical.style.transform = `translateX(${guide.x}px)`;
    vertical.style.height = `${guide.surfaceHeight}px`;
    const point = layers.root.ownerDocument.createElement("span");
    point.dataset.role = "snap-point";
    point.style.transform = `translate(${guide.x}px, ${guide.y}px)`;
    const row = layers.root.ownerDocument.createElement("span");
    row.dataset.role = "snap-signal-highlight";
    row.style.transform = `translateY(${guide.rowY}px)`;
    row.style.height = `${guide.rowHeight}px`;
    const label = layers.root.ownerDocument.createElement("span");
    label.dataset.role = "snap-cycle-label";
    label.style.transform = `translate(${guide.x + 6}px, ${Math.max(0, guide.y - 22)}px)`;
    label.textContent = guide.label;
    layers.interactive.replaceChildren(row, vertical, point, label);
  }

  updateEdgeCounters(primitives: readonly EdgeCounterOverlayPrimitive[]): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before Edge Number update.");
    const active = new Set(primitives.map((primitive) => primitive.id));
    for (const [id, owner] of this.#edgeCounterOwners) if (!active.has(id)) { owner.remove(); this.#edgeCounterOwners.delete(id); }
    for (const primitive of primitives) {
      let owner = this.#edgeCounterOwners.get(primitive.id);
      if (!owner) {
        owner = layers.root.ownerDocument.createElement("span");
        owner.dataset.role = "clock-edge-number";
        owner.dataset.edgeCounterId = primitive.id;
        owner.dataset.signalId = primitive.signalId;
        this.#edgeCounterOwners.set(primitive.id, owner);
        layers.overlays.append(owner);
      }
      owner.style.transform = `translate(${primitive.x}px, ${primitive.y}px)`;
      owner.textContent = primitive.label;
    }
  }

  async whenIdle(): Promise<void> {
    while (this.#pending.size > 0) await Promise.all([...this.#pending]);
  }

  dispose(): void {
    for (const signalId of this.#waveOwners.keys()) this.#provider.disposeWave(signalId);
    this.#waveOwners.clear();
    this.#dirtyWaves.clear();
    this.#waveVersions.clear();
    this.#wavePending.clear();
    this.#waveQueue.clear();
    this.#waveRendersBySignal.clear();
    this.#localGeometryBuildsBySignal.clear();
    this.#waveBatchScheduled = false;
    this.#leftRows.clear();
    this.#frozenRows.clear();
    this.#timingRows.clear();
    this.#overlayOwners.clear();
    this.#overlaySignatures.clear();
    this.#edgeCounterOwners.clear();
    this.#rowY.clear();
    this.#canonicalSignalIdsSource = undefined;
    this.#canonicalSignalIdSet.clear();
    this.#documentRowIdsSource = undefined;
    this.#visibleRowIdsSource = undefined;
    this.#documentEpoch = 0;
    this.#rowYPrunePasses = 0;
    this.#rowLayoutSource = undefined;
    this.#rowIndex.clear();
    this.#navigationRowLayoutSource = undefined;
    this.#navigationRowIndex.clear();
    this.#layers?.root.remove();
    this.#layers = undefined;
  }

  #queueWave(signalId: WaveSignalId, owner: HTMLElement): void {
    if (this.#wavePending.has(signalId)) return;
    this.#wavePending.add(signalId);
    const version = this.#waveVersions.get(signalId) ?? 0;
    this.#waveQueue.set(signalId, { owner, version });
    this.#scheduleWaveBatch();
  }

  #indexedRows(source: readonly RowLayoutEntry[], navigation: boolean): ReadonlyMap<string, RowLayoutEntry> {
    if (navigation) {
      if (this.#navigationRowLayoutSource !== source) {
        this.#navigationRowLayoutSource = source;
        this.#navigationRowIndex = new Map(source.map((row) => [row.rowId, row]));
        this.#diagnostics = { ...this.#diagnostics, fullRowScans: this.#diagnostics.fullRowScans + 1 };
      }
      return this.#navigationRowIndex;
    }
    if (this.#rowLayoutSource !== source) {
      this.#rowLayoutSource = source;
      this.#rowIndex = new Map(source.map((row) => [row.rowId, row]));
      this.#diagnostics = { ...this.#diagnostics, fullRowScans: this.#diagnostics.fullRowScans + 1 };
    }
    return this.#rowIndex;
  }

  #scheduleWaveBatch(): void {
    if (this.#waveBatchScheduled) return;
    this.#waveBatchScheduled = true;
    let task: Promise<void>;
    task = nextBrowserFrame().then(() => {
      this.#diagnostics = { ...this.#diagnostics, waveBatchFrameYields: this.#diagnostics.waveBatchFrameYields + 1 };
      return this.#flushWaveBatch();
    }).finally(() => {
      this.#pending.delete(task);
      this.#waveBatchScheduled = false;
      if (this.#waveQueue.size > 0) this.#scheduleWaveBatch();
    });
    this.#pending.add(task);
  }

  async #flushWaveBatch(): Promise<void> {
    const requests = [...this.#waveQueue.entries()].slice(0, WAVE_BATCH_LIMIT).map(([signalId, item]) => ({ signalId, owner: item.owner, version: item.version }));
    for (const request of requests) this.#waveQueue.delete(request.signalId);
    if (requests.length === 0) return;
    const batchId = String(++this.#waveBatchSequence);
    this.#diagnostics = {
      ...this.#diagnostics,
      waveBatchCount: this.#diagnostics.waveBatchCount + 1,
      waveBatchMaxSize: Math.max(this.#diagnostics.waveBatchMaxSize, requests.length),
      waveBatchPending: this.#waveQueue.size,
    };
    this.#publishCounters();
    for (const request of requests) {
      request.owner.dataset.waveBatchId = batchId;
      request.owner.dataset.waveBatchSize = String(requests.length);
    }
    let results: readonly WaveMountBatchItem[];
    if (this.#provider.mountWaveBatch) {
      try {
        results = await this.#provider.mountWaveBatch(requests satisfies readonly WaveMountRequest[]);
      } catch (error: unknown) {
        results = requests.map(({ signalId }) => ({ signalId, error }));
      }
    } else {
      results = await Promise.all(requests.map(async ({ signalId, owner }) => {
        try { return { signalId, result: await this.#provider.mountWave(signalId, owner) }; }
        catch (error: unknown) { return { signalId, error }; }
      }));
    }
    const bySignal = new Map(results.map((item) => [item.signalId, item]));
    for (const request of requests) {
      const item = bySignal.get(request.signalId);
      if (item?.result) {
        const delta = item.result;
        this.#counters = {
          ...this.#counters,
          waveDromRenders: this.#counters.waveDromRenders + delta.waveDromRenders,
          localGeometryBuilds: this.#counters.localGeometryBuilds + delta.localGeometryBuilds,
        };
        const firstWaveRenderForSignal = !this.#waveRendersBySignal.has(request.signalId);
        const firstGeometryBuildForSignal = !this.#localGeometryBuildsBySignal.has(request.signalId);
        this.#waveRendersBySignal.set(request.signalId, (this.#waveRendersBySignal.get(request.signalId) ?? 0) + delta.waveDromRenders);
        this.#localGeometryBuildsBySignal.set(request.signalId, (this.#localGeometryBuildsBySignal.get(request.signalId) ?? 0) + delta.localGeometryBuilds);
        this.#diagnostics = { ...this.#diagnostics, waveRendersBySignalCount: this.#diagnostics.waveRendersBySignalCount + (firstWaveRenderForSignal ? 1 : 0), localGeometryBuildsBySignalCount: this.#diagnostics.localGeometryBuildsBySignalCount + (firstGeometryBuildForSignal ? 1 : 0) };
        request.owner.removeAttribute("data-wave-error");
        if ((this.#waveVersions.get(request.signalId) ?? 0) === request.version) this.#dirtyWaves.delete(request.signalId);
      } else {
        request.owner.replaceChildren();
        request.owner.dataset.waveError = item?.error instanceof Error ? item.error.message : "Unknown waveform render failure";
      }
      this.#wavePending.delete(request.signalId);
      if (request.owner.isConnected && this.#dirtyWaves.has(request.signalId) && (this.#waveVersions.get(request.signalId) ?? 0) !== request.version) this.#queueWave(request.signalId, request.owner);
    }
    this.#diagnostics = { ...this.#diagnostics, waveBatchPending: this.#waveQueue.size };
    this.#publishCounters();
  }

  #publishCounters(): void {
    if (!this.#layers) return;
    const started = globalThis.performance.now();
    const stringifyStarted = started;
    const renderCounters = JSON.stringify(this.#counters);
    const performanceCounters = JSON.stringify(this.diagnosticSummary());
    const stringifyDuration = globalThis.performance.now() - stringifyStarted;
    const encodingStarted = globalThis.performance.now();
    const payloadBytes = diagnosticEncoder.encode(renderCounters).byteLength + diagnosticEncoder.encode(performanceCounters).byteLength;
    const encodingDuration = globalThis.performance.now() - encodingStarted;
    const publishStarted = globalThis.performance.now();
    this.#layers.root.dataset.renderCounters = renderCounters;
    this.#layers.root.dataset.performanceCounters = performanceCounters;
    const publishDuration = globalThis.performance.now() - publishStarted;
    this.#diagnostics = {
      ...this.#diagnostics,
      diagnosticSerializationCount: this.#diagnostics.diagnosticSerializationCount + 1,
      diagnosticSerializationBytes: this.#diagnostics.diagnosticSerializationBytes + payloadBytes,
      diagnosticSerializationDurationMs: this.#diagnostics.diagnosticSerializationDurationMs + (globalThis.performance.now() - started),
      diagnosticStringifyCount: this.#diagnostics.diagnosticStringifyCount + 2,
      diagnosticStringifyDurationMs: this.#diagnostics.diagnosticStringifyDurationMs + stringifyDuration,
      diagnosticEncodingCount: this.#diagnostics.diagnosticEncodingCount + 2,
      diagnosticEncodingDurationMs: this.#diagnostics.diagnosticEncodingDurationMs + encodingDuration,
      diagnosticPublishCount: this.#diagnostics.diagnosticPublishCount + 1,
      diagnosticPublishDurationMs: this.#diagnostics.diagnosticPublishDurationMs + publishDuration,
    };
  }
}

function renderOverlay(owner: HTMLElement, primitive: AnnotationOverlayPrimitive): void {
  owner.dataset.annotationType = primitive.type;
  owner.dataset.annotationShape = primitive.shape;
  owner.dataset.visible = String(primitive.visible);
  owner.dataset.lineType = primitive.lineType ?? "straight";
  owner.dataset.arrowhead = primitive.arrowhead ?? "none";
  if (primitive.sourceSignalId) owner.dataset.sourceSignalId = primitive.sourceSignalId;
  else delete owner.dataset.sourceSignalId;
  if (primitive.traceOffsetCycles !== undefined) owner.dataset.traceOffsetCycles = String(primitive.traceOffsetCycles);
  else delete owner.dataset.traceOffsetCycles;
  owner.setAttribute("aria-label", `${primitive.type}: ${primitive.label}`);
  owner.hidden = !primitive.visible;
  owner.style.setProperty("--annotation-color", primitive.color ?? "#d04a36");
  owner.style.height = `${primitive.surfaceHeight}px`;
  const document = owner.ownerDocument;
  const body = document.createElement("span");
  body.dataset.role = "annotation-body";
  const first = primitive.anchors[0] ?? { field: "anchor" as const, x: 0, y: 0 };
  const second = primitive.anchors[1] ?? first;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  if (primitive.shape === "point") {
    body.style.transform = `translate(${first.x}px, ${first.y}px)`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "vertical") {
    body.style.transform = `translateX(${first.x}px)`;
    body.style.height = `${primitive.surfaceHeight}px`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "range") {
    body.style.transform = `translate(${Math.min(first.x, second.x)}px, 0px)`;
    body.style.width = `${Math.max(2, Math.abs(dx))}px`;
    body.style.height = `${primitive.surfaceHeight}px`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "trace") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.dataset.role = "ghost-trace";
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(primitive.surfaceHeight));
    svg.setAttribute("aria-hidden", "true");
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.dataset.role = "ghost-trace-path";
    polyline.setAttribute("points", (primitive.tracePoints ?? []).map((point) => `${point.x},${point.y}`).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", primitive.color ?? "#64748b");
    polyline.setAttribute("stroke-width", "2");
    polyline.setAttribute("stroke-dasharray", "6 4");
    polyline.setAttribute("opacity", String(primitive.opacity ?? 0.55));
    svg.append(polyline);
    body.append(svg);
    body.dataset.annotationField = first.field;
  } else {
    if (primitive.lineType === "orthogonal") {
      body.style.transform = `translate(${Math.min(first.x, second.x)}px, ${Math.min(first.y, second.y)}px)`;
      body.style.width = `${Math.max(2, Math.abs(dx))}px`;
      body.style.height = `${Math.max(2, Math.abs(dy))}px`;
      body.dataset.orthogonalDirection = `${dx < 0 ? "left" : "right"}-${dy < 0 ? "up" : "down"}`;
    } else {
      body.style.transform = `translate(${first.x}px, ${first.y}px) rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
      body.style.width = `${Math.max(2, Math.hypot(dx, dy))}px`;
    }
    body.dataset.annotationField = first.field;
  }
  const label = document.createElement("span");
  label.dataset.role = "annotation-label";
  label.dataset.annotationLabel = "true";
  label.textContent = primitive.label;
  label.style.transform = `translate(${(first.x + second.x) / 2 + (primitive.labelOffset?.x ?? 0)}px, ${(first.y + second.y) / 2 + (primitive.labelOffset?.y ?? -14)}px)`;
  const handles = primitive.anchors.map((anchor) => {
    const handle = document.createElement("span");
    handle.dataset.role = "annotation-handle";
    handle.dataset.annotationField = anchor.field;
    if (anchor.threshold !== undefined) handle.dataset.anchorThreshold = String(anchor.threshold);
    handle.style.transform = `translate(${anchor.x}px, ${anchor.y}px)`;
    return handle;
  });
  owner.replaceChildren(body, label, ...handles);
}

function element(owner: Document | HTMLElement, tag: "div", role: string): HTMLElement {
  const document = owner instanceof Document ? owner : owner.ownerDocument;
  const result = document.createElement(tag);
  result.dataset.role = role;
  result.style.position = role === "timing-chart-surface" ? "relative" : "absolute";
  return result;
}

function groupStyleAppliesToSurface(extend: "label" | "waveform" | "both" | undefined, surface: string): boolean {
  const scope = extend ?? "both";
  const isWaveform = surface === "timing";
  return scope === "both" || (scope === "waveform" ? isWaveform : !isWaveform);
}

function syncShellLayer(layer: HTMLElement, cache: Map<string, HTMLElement>, rowIds: readonly string[], rows: ReadonlyMap<string, RowLayoutEntry>, surface: string): { creates: number; destroys: number; moves: number } {
  const active = new Set(rowIds);
  let creates = 0, destroys = 0, moves = 0;
  for (const [rowId, shell] of cache) if (!active.has(rowId)) { shell.remove(); cache.delete(rowId); destroys += 1; }
  const ordered: HTMLElement[] = [];
  let previousGroupId: string | undefined;
  for (const rowId of rowIds) {
    const row = rows.get(rowId);
    if (!row) throw new Error(`Missing RowLayout for '${rowId}'.`);
    let shell = cache.get(rowId);
    if (!shell) {
      shell = element(layer.ownerDocument, "div", `${surface}-row`);
      shell.dataset.rowId = rowId;
      cache.set(rowId, shell);
      creates += 1;
    }
    shell.dataset.kind = row.kind;
    shell.dataset.name = row.name;
    shell.dataset.groupId = row.groupId;
    shell.dataset.groupName = row.groupName;
    if (surface === "left") {
      shell.setAttribute("role", "treeitem");
      shell.tabIndex = -1;
      shell.setAttribute("aria-level", "2");
    }
    const groupStyleApplies = groupStyleAppliesToSurface(row.groupStyle?.extend, surface);
    if (groupStyleApplies && row.groupStyle?.showBackground && row.groupStyle.background) shell.style.setProperty("--group-background", row.groupStyle.background);
    else shell.style.removeProperty("--group-background");
    if (groupStyleApplies && row.groupStyle?.opacity !== undefined) shell.style.opacity = String(row.groupStyle.opacity); else shell.style.removeProperty("opacity");
    if (groupStyleApplies && row.groupStyle?.border) shell.style.setProperty("--group-border", row.groupStyle.border); else shell.style.removeProperty("--group-border");
    shell.dataset.groupStart = String(row.groupId !== previousGroupId);
    shell.dataset.instancePath = row.instancePath?.join(".") ?? "";
    shell.dataset.fullPath = row.fullPath ?? row.name;
    if (row.role) shell.dataset.signalRole = row.role; else delete shell.dataset.signalRole;
    applyDisplayStyle(shell, row);
    if (!shell.hasAttribute("aria-selected")) shell.setAttribute("aria-selected", "false");
    if (surface === "left" && row.kind === "timing") {
      shell.draggable = true;
      shell.setAttribute("aria-grabbed", "false");
    }
    const signature = `${row.kind}\u0000${row.name}\u0000${row.commentTitle ?? ""}\u0000${row.commentBody ?? ""}\u0000${row.groupId}\u0000${row.role ?? ""}\u0000${row.fullPath ?? ""}\u0000${JSON.stringify(row.groupStyle ?? {})}\u0000${JSON.stringify(row.displayStyle ?? {})}\u0000${row.displayAlign ?? ""}\u0000${row.displayOverflow ?? ""}\u0000${row.visible}\u0000${row.groupId !== previousGroupId}`;
    if (shell.dataset.shellSignature !== signature) { populateShell(shell, row, surface, row.groupId !== previousGroupId); shell.dataset.shellSignature = signature; }
    if (surface === "left" && row.kind === "timing") {
      const visibility = shell.querySelector<HTMLElement>("[data-role='tree-visibility']");
      if (visibility) {
        visibility.setAttribute("aria-pressed", String(row.visible));
        visibility.dataset.visibilityState = row.visible ? "on" : "off";
        visibility.setAttribute("aria-label", `${row.visible ? "Hide" : "Show"} ${row.name}`);
      }
    }
    place(shell, row);
    ordered.push(shell);
    previousGroupId = row.groupId;
  }
  const currentRows = Array.from(layer.children).filter((child) => !(child as HTMLElement).dataset.groupHeader);
  if (ordered.length !== currentRows.length || ordered.some((shell, index) => currentRows[index] !== shell)) {
    const currentHeaders = Array.from(layer.children).filter((child) => (child as HTMLElement).dataset.groupHeader);
    layer.replaceChildren(...ordered, ...currentHeaders);
    moves = ordered.length;
  }
  return { creates, destroys, moves };
}

function populateShell(shell: HTMLElement, row: RowLayoutEntry, surface: string, groupStart: boolean): void {
  if (surface === "timing") {
    if (row.kind !== "comment") return;
    const comment = shell.ownerDocument.createElement("span");
    comment.dataset.role = "comment-row-content";
    comment.dataset.cycle = "0";
    comment.setAttribute("aria-label", `${row.commentTitle ?? row.name} at cycle 0`);
    comment.textContent = row.commentBody || row.commentTitle || row.name;
    shell.replaceChildren(comment);
    return;
  }
  const document = shell.ownerDocument;
  if (surface === "left") {
    const branch = document.createElement("span");
    branch.dataset.role = "tree-branch";
    branch.dataset.groupId = row.groupId;
    branch.draggable = groupStart;
    branch.textContent = "";
    const name = document.createElement("span");
    name.dataset.role = "tree-signal-name";
    name.textContent = row.name;
    name.title = row.fullPath ?? row.name;
    const role = createRoleBadge(document, row.kind, row.role, "tree-signal-role");
    role.title = row.kind === "comment" ? "Comment Row" : row.role ?? "internal";
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.dataset.role = "tree-visibility";
    visibility.dataset.treeSignalId = row.rowId;
    visibility.setAttribute("aria-label", `Toggle visibility of ${row.name}`);
    visibility.append(createLeftTreeIcon(document, row.visible ? "eye" : "eye-off", "surface-icon eye-icon"));
    const more = document.createElement("button");
    more.type = "button";
    more.dataset.role = "tree-more";
    more.dataset.treeSignalId = row.rowId;
    more.setAttribute("aria-label", `More actions for ${row.name}`);
    more.append(createLeftTreeIcon(document, "more", "surface-icon more-icon"));
    // Keep the draggable branch node mounted for command routing, but let the
    // visual contract place the role badge before the signal name.
    shell.replaceChildren(role, name, visibility, more, branch);
    return;
  }
  const role = createRoleBadge(document, row.kind, row.role, "signal-role");
  const name = document.createElement("span");
  name.dataset.role = "frozen-signal-name";
  name.textContent = row.name;
  shell.replaceChildren(role, name);
}

function syncGroupHeaderLayer(layer: HTMLElement, cache: Map<string, HTMLElement>, headerIds: readonly GroupHeaderLayoutEntry["rowId"][], headers: readonly GroupHeaderLayoutEntry[], surface: string): { creates: number; destroys: number; moves: number } {
  const active = new Set<string>(headerIds);
  let creates = 0, destroys = 0, moves = 0;
  for (const [id, shell] of cache) if (!active.has(id)) { shell.remove(); cache.delete(id); destroys += 1; }
  const byId = new Map(headers.map((header) => [header.rowId, header]));
  const ordered: HTMLElement[] = [];
  for (const id of headerIds) {
    const header = byId.get(id);
    if (!header) continue;
    let shell = cache.get(id);
    if (!shell) {
      shell = element(layer.ownerDocument, "div", `${surface}-group-header`);
      shell.dataset.rowId = id;
      cache.set(id, shell);
      creates += 1;
    }
    shell.dataset.groupId = header.groupId;
    shell.dataset.groupName = header.groupName;
    shell.dataset.groupHeader = "true";
    if (surface === "left") {
      shell.setAttribute("role", "treeitem");
      shell.tabIndex = -1;
      shell.setAttribute("aria-level", "1");
      shell.setAttribute("aria-expanded", String(!header.collapsed));
      shell.setAttribute("aria-selected", "false");
    }
    const groupStyleApplies = groupStyleAppliesToSurface(header.groupStyle?.extend, surface);
    if (groupStyleApplies && header.groupStyle?.showBackground && header.groupStyle.background) shell.style.setProperty("--group-background", header.groupStyle.background);
    else shell.style.removeProperty("--group-background");
    if (groupStyleApplies && header.groupStyle?.border) shell.style.setProperty("--group-border", header.groupStyle.border);
    else shell.style.removeProperty("--group-border");
    if (surface === "left") populateGroupHeader(shell, header);
    else if (surface === "frozen") shell.textContent = header.groupName;
    else shell.replaceChildren();
    place(shell, header);
    ordered.push(shell);
  }
  const currentRows = Array.from(layer.children).filter((child) => !(child as HTMLElement).dataset.groupHeader) as HTMLElement[];
  const combined = [...currentRows, ...ordered];
  combined.sort((left, right) => {
    const y = (item: HTMLElement) => Number.parseFloat(item.style.transform.match(/translateY\((-?[0-9.]+)px\)/)?.[1] ?? "0");
    return y(left) - y(right);
  });
  const current = Array.from(layer.children);
  if (combined.length !== current.length || combined.some((shell, index) => current[index] !== shell)) {
    layer.replaceChildren(...combined);
    moves += combined.length;
  }
  return { creates, destroys, moves };
}

function populateGroupHeader(shell: HTMLElement, header: GroupHeaderLayoutEntry): void {
  const document = shell.ownerDocument;
  const branch = document.createElement("span");
  branch.dataset.role = "tree-branch";
  branch.dataset.groupId = header.groupId;
  branch.draggable = true;
  branch.setAttribute("aria-label", `Select ${header.groupName} group`);
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.dataset.role = "tree-collapse";
  collapse.dataset.groupId = header.groupId;
  collapse.setAttribute("aria-label", `${header.collapsed ? "Expand" : "Collapse"} ${header.groupName} group`);
  collapse.setAttribute("aria-expanded", String(!header.collapsed));
  collapse.dataset.collapsed = String(header.collapsed);
  collapse.append(createLeftTreeIcon(document, header.collapsed ? "chevron-right" : "chevron-down", "surface-icon chevron-icon"));
  branch.append(collapse, document.createTextNode(` ${header.groupName}`));
  const more = document.createElement("button");
  more.type = "button";
  more.dataset.role = "tree-group-more";
  more.dataset.groupId = header.groupId;
  more.setAttribute("aria-label", `More actions for ${header.groupName}`);
  more.append(createLeftTreeIcon(document, "more", "surface-icon more-icon"));
  shell.replaceChildren(branch, more);
}

function applyDisplayStyle(shell: HTMLElement, row: RowLayoutEntry): void {
  const style = row.displayStyle ?? {};
  const color = typeof style.color === "string" && /^#[0-9a-f]{3,8}$/i.test(style.color) ? style.color : undefined;
  const background = typeof style.background === "string" && /^#[0-9a-f]{3,8}$/i.test(style.background) ? style.background : undefined;
  const fontWeight = typeof style.fontWeight === "string" && /^(normal|bold|[1-9]00)$/.test(style.fontWeight) ? style.fontWeight : undefined;
  const fontStyle = style.fontStyle === "italic" || style.fontStyle === "normal" ? style.fontStyle : undefined;
  const fontFamily = typeof style.fontFamily === "string" && style.fontFamily.length <= 120 ? style.fontFamily : undefined;
  const fontSize = typeof style.fontSize === "number" && style.fontSize >= 6 && style.fontSize <= 48 ? style.fontSize : undefined;
  const textDecoration = typeof style.textDecoration === "string" && /^(|underline|line-through|underline line-through)$/.test(style.textDecoration) ? style.textDecoration : undefined;
  if (color) { shell.style.color = color; shell.dataset.signalStyleColor = color; } else { shell.style.removeProperty("color"); delete shell.dataset.signalStyleColor; }
  if (background) shell.style.backgroundColor = background; else shell.style.removeProperty("background-color");
  if (fontWeight) shell.style.fontWeight = fontWeight; else shell.style.removeProperty("font-weight");
  if (fontStyle) shell.style.fontStyle = fontStyle; else shell.style.removeProperty("font-style");
  if (fontFamily) shell.style.fontFamily = fontFamily; else shell.style.removeProperty("font-family");
  if (fontSize) shell.style.fontSize = `${fontSize}px`; else shell.style.removeProperty("font-size");
  if (textDecoration !== undefined) shell.style.textDecoration = textDecoration; else shell.style.removeProperty("text-decoration");
  if (row.displayAlign) shell.style.textAlign = row.displayAlign; else shell.style.removeProperty("text-align");
  if (row.displayOverflow === "wrap") { shell.style.whiteSpace = "normal"; shell.style.textOverflow = "clip"; } else if (row.displayOverflow === "expand") { shell.style.whiteSpace = "nowrap"; shell.style.textOverflow = "clip"; } else { shell.style.whiteSpace = "nowrap"; shell.style.textOverflow = "ellipsis"; }
}

function place(element: HTMLElement, row: Pick<RowLayoutEntry, "y" | "height">): void {
  element.style.transform = `translateY(${row.y}px)`;
  element.style.height = `${row.height}px`;
}

function assertCrossSurfaceInvariant(projection: RenderProjection): void {
  const mounted = new Set<string>(projection.mountedRowIds);
  const timingIsMounted = projection.timingRowIds.every((rowId) => mounted.has(rowId));
  const mountedSubset = (ids: readonly string[]) => ids.every((id) => mounted.has(id));
  if (!mountedSubset(projection.leftRowIds) || !mountedSubset(projection.frozenLabelRowIds) || !mountedSubset(projection.timingRowIds) || !timingIsMounted) {
    const missing = (ids: readonly string[]) => ids.filter((id) => !mounted.has(id)).join(",");
    throw new Error(`Cross-surface row ID invariant failed (left=${missing(projection.leftRowIds)} frozen=${missing(projection.frozenLabelRowIds)} timing=${missing(projection.timingRowIds)}).`);
  }
}
