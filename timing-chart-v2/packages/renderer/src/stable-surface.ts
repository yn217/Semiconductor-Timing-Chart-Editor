import type { RenderProjection, RowLayoutEntry } from "@timing-chart-v2/projection";
import { createLeftTreeIcon, createRoleBadge } from "./tree-row-dom.js";
import type { AnnotationOverlayPrimitive, EdgeCounterOverlayPrimitive, RenderCounters, RendererDiagnosticSummary, RendererDiagnostics, RendererRowIdentitySnapshot, SnapGuidePrimitive, TimingChartRenderer, WaveformSurfaceProvider, WaveMountBatchItem, WaveMountRequest, WavePrefetchRequest, WaveSignalId } from "./types.js";
import { isWavePrefetchModeEligible, WavePrefetchLifecycle } from "./wave-prefetch-lifecycle.js";
import { applyTextStyle, parseTextStyle, renderOverlay } from "./annotation-overlay-dom.js";
import { groupBackgroundColor } from "./group-background.js";
import { syncGroupHeaderLayer } from "./group-header-dom.js";

export function isWaveMountRequestFresh(request: Pick<WaveMountRequest, "documentEpoch" | "isFresh">, currentDocumentEpoch: number): boolean {
  return (request.documentEpoch === undefined || request.documentEpoch === currentDocumentEpoch) && (request.isFresh?.() ?? true);
}

/** Release a viewport-evicted owner while keeping its bounded reusable render artifact when supported. */
export function releaseWaveOwnerForCacheEviction(provider: WaveformSurfaceProvider, signalId: WaveSignalId): void {
  if (provider.retainWaveArtifact) provider.retainWaveArtifact(signalId);
  else provider.disposeWave(signalId);
}

const diagnosticEncoder = new TextEncoder();

function signalTypeLabel(type: string | undefined): string {
  if (type === "clock") return "Clock";
  if (type === "commentRow") return "Comment";
  if (type === "pulse") return "Pulse";
  if (type === "binary") return "Signal";
  if (type === "bus") return "Bus";
  if (type === "state") return "State";
  if (type === "logic") return "Level";
  if (type === "event") return "Event";
  return type ?? "Signal";
}

function signalPresentationLabel(kind: RowLayoutEntry["kind"], role: RowLayoutEntry["role"], signalType: string | undefined): string {
  if (kind === "comment") return "";
  if (signalType === undefined || signalType === "binary") return role === "input" ? "i" : role === "output" ? "o" : "wire";
  return signalTypeLabel(signalType);
}

function nextBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else globalThis.setTimeout(resolve, 0);
  });
}

interface Layers {
  readonly root: HTMLElement;
  readonly left: HTMLElement;
  frozen: HTMLElement | undefined;
  readonly timing: HTMLElement;
  readonly waves: HTMLElement;
  readonly overlays: HTMLElement;
  readonly interactive: HTMLElement;
}

interface PendingWaveRequest {
  readonly owner: HTMLElement;
  readonly version: number;
  readonly documentEpoch: number;
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
  readonly #wavePending = new Map<WaveSignalId, PendingWaveRequest>();
  readonly #waveQueue = new Map<WaveSignalId, PendingWaveRequest>();
  readonly #waveWindowRetryKeys = new Set<string>();
  readonly #waveStaleRetryKeys = new Set<string>();
  readonly #waveRendersBySignal = new Map<WaveSignalId, number>();
  readonly #localGeometryBuildsBySignal = new Map<WaveSignalId, number>();
  #waveBatchScheduled = false;
  #waveBatchSequence = 0;
  #prefetchRowLayoutSource: readonly RowLayoutEntry[] | undefined;
  #prefetchSignalIds: readonly WaveSignalId[] = [];
  #prefetchIndexBySignal = new Map<WaveSignalId, number>();
  #prefetchPlan: readonly WavePrefetchRequest[] = [];
  readonly #prefetchLifecycle = new WavePrefetchLifecycle();
  #prefetchTask: Promise<void> | undefined;
  #prefetchAttempted = new Set<string>();
  #lastPrefetchScrollTop: number | undefined;
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
  #diagnostics: RendererDiagnostics = { projectionUpdates: 0, mountedRows: 0, mountedWaveOwners: 0, cachedWaveOwners: 0, waveOwnerCacheLimit: 32, domNodeCreates: 0, domNodeDestroys: 0, domNodeMoves: 0, waveArtifactCacheHits: 0, waveArtifactCacheMisses: 0, waveArtifactDisposals: 0, waveArtifactMarkupCacheHits: 0, waveArtifactMarkupCacheMisses: 0, waveRendersBySignal: {}, localGeometryBuildsBySignal: {}, annotationResolvePasses: 0, resolvedAnnotations: 0, waveBatchCount: 0, waveBatchFrameYields: 0, waveBatchMaxSize: 0, waveBatchPending: 0, wavePrefetchOwnerCount: 0, wavePrefetchRequestedCount: 0, wavePrefetchPreparedCount: 0, wavePrefetchReusedCount: 0, wavePrefetchStaleCount: 0, wavePrefetchFailedCount: 0, rowsVisited: 0, fullRowScans: 0, waveRendersBySignalCount: 0, localGeometryBuildsBySignalCount: 0, documentEpoch: 0, rowYSize: 0, rowYStaleCount: 0, rowYPrunePasses: 0, dirtyWaveSize: 0, waveVersionSize: 0, fullReplaceEpochResets: 0, staleWaveResultsDropped: 0, diagnosticMapPrunePasses: 0, diagnosticSerializationCount: 0, diagnosticSerializationBytes: 0, diagnosticSerializationDurationMs: 0, diagnosticStringifyCount: 0, diagnosticStringifyDurationMs: 0, diagnosticEncodingCount: 0, diagnosticEncodingDurationMs: 0, diagnosticPublishCount: 0, diagnosticPublishDurationMs: 0 };

  constructor(provider: WaveformSurfaceProvider) {
    this.#provider = provider;
  }

  mount(host: HTMLElement): void {
    if (this.#layers) throw new Error("Timing chart renderer is already mounted.");
    const root = element(host, "div", "timing-chart-surface");
    const left = element(host, "div", "left-tree-rows");
    const frozen = this.#cyclePresentationActive(host) ? element(host, "div", "frozen-label-rows") : undefined;
    const timing = element(host, "div", "timing-semantic-rows");
    const waves = element(host, "div", "stable-waveform-surface");
    const overlays = element(host, "div", "annotation-overlay-surface");
    const interactive = element(host, "div", "interactive-overlay-surface");
    left.setAttribute("role", "tree");
    left.setAttribute("aria-label", "Signals and Groups");
    left.tabIndex = 0;
    // #625: the time-domain layers live in one TimelineViewport wrapper (`display: contents` except in Cycle mode, where CSS makes
    // it the horizontal scroll owner so the fixed columns are never inside a horizontal overflow box).
    const timelineViewport = element(host, "div", "timeline-viewport");
    for (const layer of [timing, waves, overlays, interactive]) timelineViewport.append(layer);
    root.append(left);
    if (frozen) root.append(frozen);
    root.append(timelineViewport);
    host.replaceChildren(root);
    this.#layers = { root, left, frozen, timing, waves, overlays, interactive };
    Object.defineProperty(root, "requestPerformanceSnapshot", { configurable: true, value: () => this.diagnostics() });
    Object.defineProperty(root, "requestRowIdentitySnapshot", { configurable: true, value: () => this.rowIdentitySnapshot() });
    this.#publishCounters();
  }

  update(projection: RenderProjection): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before update.");
    const frozenLayer = this.#syncFrozenLayer(layers);
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
    const shellStats = [syncShellLayer(layers.left, this.#leftRows, projection.leftRowIds, navigationRows, "left"), ...(frozenLayer ? [syncShellLayer(frozenLayer, this.#frozenRows, projection.frozenLabelRowIds, rows, "frozen")] : []), syncShellLayer(layers.timing, this.#timingRows, projection.timingRowIds, rows, "timing")];
    const headerStats = [syncGroupHeaderLayer(layers.left, this.#leftGroupHeaders, projection.mountedLeftGroupHeaderIds, projection.leftGroupHeaders, "left"), ...(frozenLayer ? [syncGroupHeaderLayer(frozenLayer, this.#frozenGroupHeaders, projection.mountedGroupHeaderIds, projection.groupHeaders, "frozen")] : []), syncGroupHeaderLayer(layers.timing, this.#timingGroupHeaders, projection.mountedGroupHeaderIds, projection.groupHeaders, "timing")];
    this.#diagnostics = { ...this.#diagnostics, domNodeCreates: this.#diagnostics.domNodeCreates + shellStats.concat(headerStats).reduce((sum, item) => sum + item.creates, 0), domNodeDestroys: this.#diagnostics.domNodeDestroys + shellStats.concat(headerStats).reduce((sum, item) => sum + item.destroys, 0), domNodeMoves: this.#diagnostics.domNodeMoves + shellStats.concat(headerStats).reduce((sum, item) => sum + item.moves, 0) };
    // The Left Tree shows every row (hidden signals and empty-group headers
    // included) and can legitimately need more vertical space than
    // Frozen/Timing (which excludes hidden rows and never grows for an
    // empty group's own header/rows). Both scroll within this one shared
    // root, so its height must cover whichever one is taller -- sizing it
    // to totalHeight alone silently made any Left-only trailing content
    // (e.g. an empty Group's header) unreachable by scrolling, since the
    // scrollable region itself never extended that far.
    layers.root.style.height = `${Math.max(projection.totalHeight, projection.navigationTotalHeight)}px`;
    layers.root.dataset.revision = String(projection.revision);
    const presentationHost = layers.root.closest<HTMLElement>(".surface-host");
    if (presentationHost) {
      presentationHost.dataset.treeFilter = projection.signalTreeFilter;
      presentationHost.dataset.treeTypeFilter = projection.signalTreeTypeFilter;
      presentationHost.dataset.treeFilterMatches = String(projection.matchingSignalCount);
    }
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
      // Requests already queued belong to the replaced document. In-flight
      // requests remain awaitable, but their epoch is checked before any
      // result can update counters, errors, or derived geometry state.
      this.#waveQueue.clear();
      this.#wavePending.clear();
      this.#waveWindowRetryKeys.clear();
      this.#waveStaleRetryKeys.clear();
      this.#prefetchLifecycle.invalidatePlan();
      this.#prefetchPlan = [];
      this.#prefetchAttempted.clear();
      this.#diagnostics = { ...this.#diagnostics, waveRendersBySignalCount: 0, localGeometryBuildsBySignalCount: 0, diagnosticMapPrunePasses: this.#diagnosticMapPrunePasses };
      for (const [signalId, owner] of this.#waveOwners) {
        owner.remove();
        if (this.#provider.retainWaveArtifact) this.#provider.retainWaveArtifact(signalId);
        else this.#provider.disposeWave(signalId);
        this.#waveOwners.delete(signalId);
        this.#diagnostics = { ...this.#diagnostics, domNodeDestroys: this.#diagnostics.domNodeDestroys + 1, waveArtifactDisposals: this.#diagnostics.waveArtifactDisposals + 1 };
      }
      // Replacements reset per-signal freshness state. Re-seed the mounted
      // signals before their first async batch is queued; otherwise a
      // follow-up projection can leave an owner with no current version and
      // cause every otherwise-current render to be classified as stale.
      for (const signalId of projection.mountedSignalIds) this.#waveVersions.set(signalId, 0);
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
      const retryPrefix = `${this.#documentEpoch}:${signalId}:`;
      for (const key of this.#waveStaleRetryKeys) if (key.startsWith(retryPrefix)) this.#waveStaleRetryKeys.delete(key);
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
        owner.dataset.pinnedRow = String(row.pinned === true);
        place(owner, row);
        const waveformStyle = parseWaveformStyle(row.displayStyle);
        applyWaveformStyle(owner, waveformStyle);
        setCanvasWaveformColor(owner, waveformStyle.color);
        // #472: `mountWave`/`mountWaveBatch` replace `owner`'s children with
        // a freshly-generated SVG, wiping the override applied above --
        // stash the resolved color so it can be reapplied once that mount
        // actually lands (see #flushWaveBatch), without threading display
        // style through the wave-mount queue/provider contract.
        if (waveformStyle.color) owner.dataset.waveformStyleColor = waveformStyle.color; else delete owner.dataset.waveformStyleColor;
      }
      // A bounded waveform is presentation-local: scrolling can keep the
      // same owner mounted while changing the source window it must display.
      const sourceWindow = this.#provider.getSourceWindow?.(owner);
      const sourceWindowChanged = sourceWindow !== undefined &&
        (owner.dataset.renderedSourceWindowStart !== String(sourceWindow.start) ||
          owner.dataset.renderedSourceWindowEnd !== String(sourceWindow.end));
      if (isNew || this.#dirtyWaves.has(signalId) || sourceWindowChanged) this.#queueWave(signalId, owner);
    }
    this.#updateWavePrefetchPlan(projection, mounted);
    const waveOwnerCacheLimit = Math.max(32, mounted.size * 4);
    for (const [signalId, owner] of this.#waveOwners) {
      if (this.#waveOwners.size <= waveOwnerCacheLimit) break;
      if (mounted.has(signalId)) continue;
      owner.remove(); releaseWaveOwnerForCacheEviction(this.#provider, signalId); this.#waveOwners.delete(signalId); this.#dirtyWaves.delete(signalId); this.#waveVersions.delete(signalId); this.#wavePending.delete(signalId);
      this.#diagnostics = { ...this.#diagnostics, domNodeDestroys: this.#diagnostics.domNodeDestroys + 1, waveArtifactDisposals: this.#diagnostics.waveArtifactDisposals + 1 };
    }
    this.#diagnostics = { ...this.#diagnostics, mountedWaveOwners: [...this.#waveOwners.values()].filter((owner) => owner.isConnected).length, cachedWaveOwners: this.#waveOwners.size, waveOwnerCacheLimit, dirtyWaveSize: this.#dirtyWaves.size, waveVersionSize: this.#waveVersions.size, fullReplaceEpochResets: this.#fullReplaceEpochResets, diagnosticMapPrunePasses: this.#diagnosticMapPrunePasses };
    this.#publishCounters();
  }

  updatePresentation(projection: RenderProjection): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before update.");
    const frozenLayer = this.#syncFrozenLayer(layers);
    assertCrossSurfaceInvariant(projection);
    const rows = this.#indexedRows(projection.rowLayout, false);
    const navigationRows = this.#indexedRows(projection.navigationRowLayout, true);
    syncShellLayer(layers.left, this.#leftRows, projection.leftRowIds, navigationRows, "left");
    if (frozenLayer) syncShellLayer(frozenLayer, this.#frozenRows, projection.frozenLabelRowIds, rows, "frozen");
    syncShellLayer(layers.timing, this.#timingRows, projection.timingRowIds, rows, "timing");
    for (const signalId of projection.mountedSignalIds) {
      const owner = this.#waveOwners.get(signalId);
      const row = rows.get(signalId);
      if (!owner || !row) continue;
      owner.dataset.pinnedRow = String(row.pinned === true);
      const waveformStyle = parseWaveformStyle(row.displayStyle);
      applyWaveformStyle(owner, waveformStyle);
      setCanvasWaveformColor(owner, waveformStyle.color);
    }
    // #indexedRows() above owns these identity-cached indexes. Copying each
    // complete map here after every presentation-only edit duplicated O(rows)
    // work without changing the row lookup contents.
  }

  updateViewport(projection: RenderProjection): void {
    if (!this.#layers) throw new Error("Timing chart renderer must be mounted before viewport update.");
    assertCrossSurfaceInvariant(projection);
    for (const signalId of projection.mountedSignalIds) {
      const owner = this.#waveOwners.get(signalId);
      if (!owner || !owner.isConnected) {
        // A row/owner was unexpectedly evicted; restore the complete projection
        // contract instead of silently leaving a mounted Signal without a wave.
        this.update(projection);
        return;
      }
      const sourceWindow = this.#provider.getSourceWindow?.(owner);
      const sourceWindowChanged = sourceWindow !== undefined
        && (owner.dataset.renderedSourceWindowStart !== String(sourceWindow.start)
          || owner.dataset.renderedSourceWindowEnd !== String(sourceWindow.end));
      if (this.#dirtyWaves.has(signalId) || sourceWindowChanged) this.#queueWave(signalId, owner);
    }
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

  #cyclePresentationActive(host: HTMLElement): boolean {
    const mode = host.closest<HTMLElement>("[data-view-mode]")?.dataset.viewMode;
    return mode !== "Transaction";
  }

  #syncFrozenLayer(layers: Layers): HTMLElement | undefined {
    const active = this.#cyclePresentationActive(layers.root);
    if (active && !layers.frozen) {
      const frozen = element(layers.root.ownerDocument, "div", "frozen-label-rows");
      const timeline = layers.root.querySelector<HTMLElement>("[data-role='timeline-viewport']");
      if (!timeline) throw new Error("Cannot mount the Cycle frozen-column layer without its timeline viewport.");
      layers.root.insertBefore(frozen, timeline);
      layers.frozen = frozen;
      return frozen;
    }
    if (!active && layers.frozen) {
      const removedCount = this.#frozenRows.size + this.#frozenGroupHeaders.size;
      layers.frozen.remove();
      layers.frozen = undefined;
      this.#frozenRows.clear();
      this.#frozenGroupHeaders.clear();
      this.#diagnostics = { ...this.#diagnostics, domNodeDestroys: this.#diagnostics.domNodeDestroys + removedCount };
      return undefined;
    }
    return layers.frozen;
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
      // The signature covers the full semantic overlay projection, including
      // the stable ID, type, label, accessibility text, and kind metadata.
      // Unchanged owners need no identity/style resynchronization on scroll.
      if (this.#overlaySignatures.get(primitive.id) === signature) continue;
      let owner = this.#overlayOwners.get(primitive.id);
      if (!owner) {
        owner = element(layers.root.ownerDocument, "div", "annotation-owner");
        owner.dataset.annotationId = primitive.id;
        owner.tabIndex = 0;
        owner.setAttribute("role", "button");
        this.#overlayOwners.set(primitive.id, owner);
        layers.overlays.append(owner);
      }
      this.#overlaySignatures.set(primitive.id, signature);
      renderOverlay(owner, primitive);
      changes += 1;
    }
    // Z-order = DOM order = paint order (plain stacking, no z-index used).
    // Owners are otherwise only ever appended once on creation and never
    // touched again, so a caller that reorders `primitives` (bring to
    // front / send to back) needs this reconciliation or the visible
    // stacking never changes. Only reorder when it actually differs --
    // appendChild-to-move is cheap, but comparing first avoids doing it on
    // every routine update for documents with many overlays.
    const desiredOrder = primitives.map((primitive) => primitive.id);
    const currentOrder = Array.from(layers.overlays.children, (child) => (child as HTMLElement).dataset.annotationId);
    if (desiredOrder.length === currentOrder.length && desiredOrder.some((id, index) => id !== currentOrder[index])) {
      for (const id of desiredOrder) {
        const owner = this.#overlayOwners.get(id);
        if (owner) layers.overlays.append(owner);
      }
    }
    if (changes > 0) this.#counters = { ...this.#counters, overlayUpdates: this.#counters.overlayUpdates + changes };
    this.#publishCounters();
  }

  patchOverlays(primitives: readonly AnnotationOverlayPrimitive[]): number {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before overlay update.");
    this.#diagnostics = { ...this.#diagnostics, annotationResolvePasses: this.#diagnostics.annotationResolvePasses + 1, resolvedAnnotations: this.#diagnostics.resolvedAnnotations + primitives.length };
    let changes = 0;
    let matched = 0;
    for (const primitive of primitives) {
      const owner = this.#overlayOwners.get(primitive.id);
      if (!owner) continue;
      matched += 1;
      const signature = JSON.stringify(primitive);
      if (this.#overlaySignatures.get(primitive.id) === signature) continue;
      this.#overlaySignatures.set(primitive.id, signature);
      renderOverlay(owner, primitive);
      changes += 1;
    }
    if (changes > 0) this.#counters = { ...this.#counters, overlayUpdates: this.#counters.overlayUpdates + changes };
    this.#publishCounters();
    return matched;
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
    this.#waveWindowRetryKeys.clear();
    this.#waveStaleRetryKeys.clear();
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
    this.#prefetchLifecycle.invalidatePlan();
    this.#prefetchPlan = [];
    this.#prefetchAttempted.clear();
  }

  #updateWavePrefetchPlan(projection: RenderProjection, mounted: ReadonlySet<WaveSignalId>): void {
    const layers = this.#layers;
    if (!layers || !this.#provider.prefetchWaveBatch) return;
    const viewMode = layers.root.closest<HTMLElement>("[data-view-mode]")?.dataset.viewMode;
    const prefetchEligible = isWavePrefetchModeEligible(viewMode);
    const eligibilityChanged = this.#prefetchLifecycle.setEligible(prefetchEligible);
    if (!prefetchEligible) {
      if (eligibilityChanged) this.#prefetchAttempted.clear();
      this.#prefetchPlan = [];
      this.#diagnostics = { ...this.#diagnostics, wavePrefetchOwnerCount: 0 };
      return;
    }
    if (eligibilityChanged) this.#prefetchAttempted.clear();
    const sourceRows = projection.rowLayout;
    if (this.#prefetchRowLayoutSource !== sourceRows) {
      this.#prefetchRowLayoutSource = sourceRows;
      const ids: WaveSignalId[] = [];
      const indexBySignal = new Map<WaveSignalId, number>();
      // Pinned rows are presentation-reordered; avoid prefetching from a layout
      // whose visual neighbors are not a stable contiguous row interval.
      if (!sourceRows.some((row) => row.pinned === true)) {
        for (const row of sourceRows) {
          if (row.kind !== "timing" || !row.visible || row.signalType === undefined
            || row.signalType === "clock" || row.signalType === "commentRow") continue;
          const id = row.rowId as WaveSignalId;
          indexBySignal.set(id, ids.length);
          ids.push(id);
        }
      }
      this.#prefetchSignalIds = ids;
      this.#prefetchIndexBySignal = indexBySignal;
    }
    const viewport = layers.root.closest<HTMLElement>(".cycle-viewport");
    const scrollTop = viewport?.scrollTop ?? 0;
    const direction = this.#lastPrefetchScrollTop === undefined || scrollTop >= this.#lastPrefetchScrollTop ? 1 : -1;
    this.#lastPrefetchScrollTop = scrollTop;
    const mountedIndexes = [...mounted].map((id) => this.#prefetchIndexBySignal.get(id)).filter((index): index is number => index !== undefined);
    if (mountedIndexes.length === 0 || this.#prefetchSignalIds.length === 0) {
      this.#prefetchPlan = [];
      this.#diagnostics = { ...this.#diagnostics, wavePrefetchOwnerCount: 0 };
      return;
    }
    const first = Math.min(...mountedIndexes);
    const last = Math.max(...mountedIndexes);
    // Keep the detached preparation window proportional to the current visible
    // cohort and hard bounded. This covers a typical viewport-sized jump
    // without increasing connected DOM owners or the row virtualization span.
    const count = Math.min(24, Math.max(8, mounted.size));
    let candidates = direction > 0
      ? this.#prefetchSignalIds.slice(last + 1, last + 1 + count)
      : this.#prefetchSignalIds.slice(Math.max(0, first - count), first);
    if (candidates.length === 0) candidates = direction > 0
      ? this.#prefetchSignalIds.slice(Math.max(0, first - count), first)
      : this.#prefetchSignalIds.slice(last + 1, last + 1 + count);
    const sourceOwner = projection.mountedSignalIds.map((id) => this.#waveOwners.get(id)).find((owner) => owner?.isConnected);
    const sourceWindow = sourceOwner ? this.#provider.getSourceWindow?.(sourceOwner) : undefined;
    if (!sourceWindow || sourceWindow.end <= sourceWindow.start) {
      this.#prefetchPlan = [];
      this.#diagnostics = { ...this.#diagnostics, wavePrefetchOwnerCount: 0 };
      return;
    }
    const generation = this.#prefetchLifecycle.nextGeneration();
    const requests = candidates.map((signalId): WavePrefetchRequest => {
      const version = this.#waveVersions.get(signalId) ?? 0;
      if (!this.#waveVersions.has(signalId)) this.#waveVersions.set(signalId, version);
      return {
        signalId,
        documentEpoch: this.#documentEpoch,
        ownerDocument: layers.root.ownerDocument,
        sourceWindow,
        isFresh: () => this.#prefetchLifecycle.isCurrent(generation)
          && this.#documentEpoch === projection.documentEpoch
          && this.#waveVersions.get(signalId) === version
          && this.#canonicalSignalIdSet.has(signalId),
      };
    });
    const key = requests.map((request) => `${request.signalId}@${this.#waveVersions.get(request.signalId)}`).join(",")
      + `:${sourceWindow.start}-${sourceWindow.end}:${projection.documentEpoch}`;
    if (this.#prefetchLifecycle.setPlanKey(key)) {
      this.#prefetchPlan = requests;
    }
    this.#diagnostics = { ...this.#diagnostics, wavePrefetchOwnerCount: this.#prefetchPlan.length };
    // Normally prefetch starts after the visible wave batch so it cannot
    // compete with newly-mounted owners. A mode roundtrip can restore an
    // unchanged visible cohort with no wave batch queued; start the rebuilt
    // plan directly in that case instead of leaving it dormant until scroll.
    if (eligibilityChanged && this.#waveQueue.size === 0 && this.#wavePending.size === 0) this.#startWavePrefetch();
  }

  #startWavePrefetch(): void {
    if (this.#prefetchTask || !this.#layers || !this.#provider.prefetchWaveBatch || this.#prefetchPlan.length === 0) return;
    const generation = this.#prefetchLifecycle.generation;
    const plan = this.#prefetchPlan.filter((request) => {
      const key = `${request.signalId}@${this.#waveVersions.get(request.signalId)}:${request.sourceWindow?.start}-${request.sourceWindow?.end}:${request.documentEpoch}`;
      if (this.#prefetchAttempted.has(key)) return false;
      this.#prefetchAttempted.add(key);
      return true;
    });
    if (plan.length === 0) return;
    while (this.#prefetchAttempted.size > 256) {
      const oldest = this.#prefetchAttempted.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#prefetchAttempted.delete(oldest);
    }
    const task = this.#provider.prefetchWaveBatch(plan).then((result) => {
      if (!this.#prefetchLifecycle.isCurrent(generation) || !this.#layers) return;
      this.#diagnostics = {
        ...this.#diagnostics,
        wavePrefetchRequestedCount: this.#diagnostics.wavePrefetchRequestedCount + result.requested,
        wavePrefetchPreparedCount: this.#diagnostics.wavePrefetchPreparedCount + result.prepared,
        wavePrefetchReusedCount: this.#diagnostics.wavePrefetchReusedCount + result.reused,
        wavePrefetchStaleCount: this.#diagnostics.wavePrefetchStaleCount + result.stale,
        wavePrefetchFailedCount: this.#diagnostics.wavePrefetchFailedCount + result.failed,
      };
      this.#publishCounters();
    }).catch(() => {
      if (!this.#prefetchLifecycle.isCurrent(generation) || !this.#layers) return;
      this.#diagnostics = { ...this.#diagnostics, wavePrefetchFailedCount: this.#diagnostics.wavePrefetchFailedCount + plan.length };
      this.#publishCounters();
    }).finally(() => {
      if (this.#prefetchTask === task) this.#prefetchTask = undefined;
      if (!this.#prefetchLifecycle.isCurrent(generation)) this.#startWavePrefetch();
    });
    this.#prefetchTask = task;
  }

  #queueWave(signalId: WaveSignalId, owner: HTMLElement): void {
    const documentEpoch = this.#documentEpoch;
    // Signals first mounted after a document replacement were not part of
    // that replacement's initial version seeding. Store their implicit
    // version before creating the freshness closure; otherwise the request
    // captures 0 while the map still returns undefined, so every offscreen
    // row's first render is discarded as stale when it enters the viewport.
    const version = this.#waveVersions.get(signalId) ?? 0;
    if (!this.#waveVersions.has(signalId)) this.#waveVersions.set(signalId, version);
    const pending = this.#wavePending.get(signalId);
    if (pending?.owner === owner && pending.version === version && pending.documentEpoch === documentEpoch) return;
    const request = { owner, version, documentEpoch };
    owner.dataset.waveState = "pending";
    this.#wavePending.set(signalId, request);
    this.#waveQueue.set(signalId, request);
    this.#scheduleWaveBatch();
  }

  #isWavePending(signalId: WaveSignalId, request: PendingWaveRequest): boolean {
    const pending = this.#wavePending.get(signalId);
    return pending?.owner === request.owner && pending.version === request.version && pending.documentEpoch === request.documentEpoch;
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
    // The queue is populated only from viewport-mounted owners. Drain the
    // complete current viewport batch together so rows do not remain blank
    // for extra paint frames merely because the visible set exceeds an
    // arbitrary per-frame count. Detached owners are still filtered below,
    // and large-document providers retain their own cooperative frame yields.
    const queued = [...this.#waveQueue.entries()].map(([signalId, item]) => {
      const configured = this.#provider.getSourceWindow?.(item.owner);
      const start = configured?.start ?? Number(item.owner.dataset.sourceWindowStart);
      const end = configured?.end ?? Number(item.owner.dataset.sourceWindowEnd);
      return { signalId, owner: item.owner, version: item.version, documentEpoch: item.documentEpoch,
        ...(Number.isInteger(start) && Number.isInteger(end) && end > start ? { sourceWindow: { start, end } } : {}),
        isFresh: () => this.#documentEpoch === item.documentEpoch && this.#waveVersions.get(signalId) === item.version && this.#waveOwners.get(signalId) === item.owner,
      };
    });
    for (const request of queued) this.#waveQueue.delete(request.signalId);
    const requests = queued.filter((request) => {
      if (request.owner.isConnected) return true;
      // Virtualized owners can leave the viewport after they were queued but
      // before their frame runs. Keep the signal dirty so a later remount can
      // render it, but never spend WaveDrom/geometry work on a detached owner.
      if (this.#isWavePending(request.signalId, request)) this.#wavePending.delete(request.signalId);
      if (request.documentEpoch === this.#documentEpoch && this.#canonicalSignalIdSet.has(request.signalId)) this.#dirtyWaves.add(request.signalId);
      return false;
    });
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
      const stale = !isWaveMountRequestFresh(request, this.#documentEpoch) || item?.stale === true;
      if (stale) {
        this.#diagnostics = { ...this.#diagnostics, staleWaveResultsDropped: this.#diagnostics.staleWaveResultsDropped + 1 };
        if (this.#isWavePending(request.signalId, request)) this.#wavePending.delete(request.signalId);
        if (request.documentEpoch === this.#documentEpoch && this.#canonicalSignalIdSet.has(request.signalId)) {
          this.#dirtyWaves.add(request.signalId);
          const currentOwner = this.#waveOwners.get(request.signalId);
          const retryKey = `${request.documentEpoch}:${request.signalId}:${this.#waveVersions.get(request.signalId) ?? 0}`;
          if (currentOwner?.isConnected && !this.#waveStaleRetryKeys.has(retryKey)) {
            this.#waveStaleRetryKeys.add(retryKey);
            this.#queueWave(request.signalId, currentOwner);
          }
        }
        continue;
      }
      if (item?.result) {
        const delta = item.result;
        if (item.artifactMarkupCacheHit !== undefined) {
          this.#diagnostics = {
            ...this.#diagnostics,
            waveArtifactMarkupCacheHits: this.#diagnostics.waveArtifactMarkupCacheHits + (item.artifactMarkupCacheHit ? 1 : 0),
            waveArtifactMarkupCacheMisses: this.#diagnostics.waveArtifactMarkupCacheMisses + (item.artifactMarkupCacheHit ? 0 : 1),
          };
        }
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
        // #787: renderer-neutral readiness; consumers must not infer it from an <svg> child.
        request.owner.dataset.waveState = "ready";
        request.owner.dataset.waveRenderer = request.owner.querySelector("canvas[data-wave-canvas]") ? "canvas" : "svg";
        if (request.sourceWindow) {
          request.owner.dataset.renderedSourceWindowStart = String(request.sourceWindow.start);
          request.owner.dataset.renderedSourceWindowEnd = String(request.sourceWindow.end);
        } else {
          delete request.owner.dataset.renderedSourceWindowStart;
          delete request.owner.dataset.renderedSourceWindowEnd;
        }
        // #472: the fresh SVG this mount just installed has no knowledge of
        // any waveform color override -- reapply from the stashed value set
        // by the main per-row loop above (see its own comment).
        if (request.owner.dataset.waveformStyleColor) applyWaveformStyle(request.owner, { color: request.owner.dataset.waveformStyleColor });
        if ((this.#waveVersions.get(request.signalId) ?? 0) === request.version) this.#dirtyWaves.delete(request.signalId);
      } else {
        request.owner.replaceChildren();
        delete request.owner.dataset.waveRenderer;
        request.owner.dataset.waveState = "error";
        request.owner.dataset.waveError = item?.error instanceof Error ? item.error.message : "Unknown waveform render failure";
      }
      if (this.#isWavePending(request.signalId, request)) this.#wavePending.delete(request.signalId);
      this.#waveStaleRetryKeys.delete(`${request.documentEpoch}:${request.signalId}:${request.version}`);
      const currentWindow = request.owner.isConnected ? this.#provider.getSourceWindow?.(request.owner) : undefined;
      const windowStillStale = currentWindow !== undefined &&
        (request.owner.dataset.renderedSourceWindowStart !== String(currentWindow.start) ||
          request.owner.dataset.renderedSourceWindowEnd !== String(currentWindow.end));
      const retryKey = currentWindow === undefined ? undefined : `${request.documentEpoch}:${request.signalId}:${currentWindow.start}:${currentWindow.end}`;
      const canRetryWindow = retryKey === undefined || !this.#waveWindowRetryKeys.has(retryKey);
      if (retryKey !== undefined && canRetryWindow) this.#waveWindowRetryKeys.add(retryKey);
      if (request.owner.isConnected && canRetryWindow &&
        ((this.#dirtyWaves.has(request.signalId) && (this.#waveVersions.get(request.signalId) ?? 0) !== request.version) || windowStillStale)) {
        // A viewport change can arrive while this batch is rendering. The
        // earlier queue attempt is intentionally coalesced by #wavePending;
        // re-check the authoritative window after completion so the new
        // bounded artifact is never stranded behind the old one.
        this.#queueWave(request.signalId, request.owner);
      }
    }
    this.#diagnostics = { ...this.#diagnostics, waveBatchPending: this.#waveQueue.size };
    this.#publishCounters();
    this.#startWavePrefetch();
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
      shell.dataset.role = `${surface}-row`;
      cache.set(rowId, shell);
      creates += 1;
    }
    if (!shell.hasAttribute("aria-selected")) shell.setAttribute("aria-selected", "false");
    const signature = `${row.kind}\u0000${row.name}\u0000${row.commentTitle ?? ""}\u0000${row.commentBody ?? ""}\u0000${row.groupId}\u0000${row.groupName}\u0000${row.role ?? ""}\u0000${row.instancePath?.join(".") ?? ""}\u0000${row.fullPath ?? ""}\u0000${row.pinned === true}\u0000${JSON.stringify(row.groupStyle ?? {})}\u0000${JSON.stringify(row.displayStyle ?? {})}\u0000${row.displayAlign ?? ""}\u0000${row.displayOverflow ?? ""}\u0000${row.visible}\u0000${row.groupId !== previousGroupId}`;
    const typedSignature = `${signature}\u0000${row.signalType ?? ""}`;
    if (shell.dataset.shellSignature !== typedSignature) {
      shell.dataset.kind = row.kind;
      shell.dataset.name = row.name;
      shell.dataset.groupId = row.groupId;
      shell.dataset.groupName = row.groupName;
      shell.dataset.pinnedRow = String(row.pinned === true);
      if (surface === "left" && row.pinned) shell.setAttribute("aria-description", "Pinned Signal; remains visible while scrolling.");
      else if (surface === "left") shell.removeAttribute("aria-description");
      if (surface === "left") {
        shell.setAttribute("role", "treeitem");
        shell.tabIndex = -1;
        shell.setAttribute("aria-level", "2");
      }
      const groupStyleApplies = groupStyleAppliesToSurface(row.groupStyle?.extend, surface);
      const rowBackground = groupStyleApplies && row.groupStyle?.showBackground
        ? groupBackgroundColor(row.groupStyle.background, row.groupStyle.opacity)
        : undefined;
      if (rowBackground) shell.style.setProperty("--group-background", rowBackground);
      else shell.style.removeProperty("--group-background");
      shell.style.removeProperty("opacity");
      if (groupStyleApplies && row.groupStyle?.border) shell.style.setProperty("--group-border", row.groupStyle.border); else shell.style.removeProperty("--group-border");
      shell.dataset.groupStart = String(row.groupId !== previousGroupId);
      shell.dataset.instancePath = row.instancePath?.join(".") ?? "";
      shell.dataset.fullPath = row.fullPath ?? row.name;
      if (row.role) shell.dataset.signalRole = row.role; else delete shell.dataset.signalRole;
      applyDisplayStyle(shell, row);
      if (surface === "left" && (row.kind === "timing" || row.kind === "spacer")) {
        shell.draggable = true;
        shell.setAttribute("aria-grabbed", "false");
      }
      populateShell(shell, row, surface, row.groupId !== previousGroupId);
      shell.dataset.shellSignature = typedSignature;
      if (surface === "left" && row.kind === "timing") {
        const visibility = shell.querySelector<HTMLElement>("[data-role='tree-visibility']");
        if (visibility) {
          visibility.setAttribute("aria-pressed", String(row.visible));
          visibility.dataset.visibilityState = row.visible ? "on" : "off";
          visibility.setAttribute("aria-label", `${row.visible ? "Hide" : "Show"} ${row.name}`);
        }
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
  // #900: a Spacer is vertical spacing, not a Signal. No role badge / empty name / visibility eye; the Left Tree keeps a muted label
  // and the row actions (select, drag, delete) so the spacing stays editable, the Frozen and Timing surfaces stay blank.
  if (row.kind === "spacer") {
    shell.dataset.rowKind = "spacer";
    if (surface !== "left") { shell.replaceChildren(); return; }
    const branch = document.createElement("span");
    branch.dataset.role = "tree-branch";
    branch.dataset.groupId = row.groupId;
    branch.draggable = groupStart;
    branch.textContent = "";
    const label = document.createElement("span");
    label.dataset.role = "tree-spacer-label";
    label.textContent = "Spacer";
    label.title = `Spacer · ${row.height}px`;
    const more = document.createElement("button");
    more.type = "button";
    more.dataset.role = "tree-more";
    more.dataset.treeSignalId = row.rowId;
    more.setAttribute("aria-label", "More actions for spacer");
    more.append(createLeftTreeIcon(document, "more", "surface-icon more-icon"));
    shell.replaceChildren(label, more, branch);
    return;
  }
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
    if (row.signalType !== undefined && row.kind !== "comment") {
      role.textContent = signalPresentationLabel(row.kind, row.role, row.signalType);
      role.dataset.signalType = row.signalType;
      role.title = `${signalTypeLabel(row.signalType)} · ${row.role ?? "internal"}`;
    }
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
  if (row.signalType !== undefined && row.kind !== "comment") {
    role.textContent = signalPresentationLabel(row.kind, row.role, row.signalType);
    role.dataset.signalType = row.signalType;
    role.title = `${signalTypeLabel(row.signalType)} · ${row.role ?? "internal"}`;
  }
  const name = document.createElement("span");
  name.dataset.role = "frozen-signal-name";
  name.textContent = row.name;
  shell.replaceChildren(role, name);
}

/** Parses and validates the shared text-style JsonObject shape (used by
 * Signal/CommentRow display.style and Annotation.style alike) into typed,
 * safe-to-apply CSS values. One validation pass, reused by every entity
 * kind that can carry this style -- no second copy of these regexes. */
/** #472: `Signal.display.style.waveformColor` was stored in Canonical and
 * survived Save/Open, but nothing in the render pipeline ever read it --
 * the WaveDrom-generated SVG's own embedded `<style>` hardcodes its wave
 * stroke color (default `#000`) independent of Canonical presentation.
 * This overrides it as a presentation-only repaint on the already-
 * rendered SVG subtree, run on every row placement (cheap, alongside the
 * existing `place()` call) -- never as a reason to regenerate WaveDrom
 * semantics/geometry. Scoped per-owner by finding exactly which classes
 * this *specific* SVG's own embedded style currently draws at the
 * unstyled default stroke color, rather than assuming a fixed class
 * number: WaveDrom numbers classes independently per render, so the same
 * class name can mean a different visual role in a different Signal's
 * SVG -- inspecting each owner's own embedded rules keeps this correct
 * without hardcoding WaveDrom's internal numbering scheme. */
function parseWaveformStyle(style: Record<string, unknown> | undefined): { readonly color?: string | undefined } {
  const source = style ?? {};
  return { color: typeof source.waveformColor === "string" && /^#[0-9a-f]{3,8}$/i.test(source.waveformColor) ? source.waveformColor : undefined };
}

function setCanvasWaveformColor(owner: HTMLElement, color: string | undefined): void {
  const previous = owner.dataset.waveformStyleColor;
  if (color) owner.dataset.waveformStyleColor = color;
  else delete owner.dataset.waveformStyleColor;
  if (previous !== color) owner.dispatchEvent(new Event("waveform-style-change"));
}

const WAVEFORM_DEFAULT_STROKE = "#000";
const waveformImageStyleStates = new WeakMap<SVGImageElement, { color: string | undefined; revision: number }>();
const waveformUseStyleStates = new WeakMap<SVGSVGElement, { color: string; defs: SVGDefsElement; originalHrefByUse: Map<SVGUseElement, string> }>();
let nextWaveformStyleSymbolId = 0;

function applySharedSymbolWaveformColor(svg: SVGSVGElement, color: string | undefined, classes: ReadonlySet<string>): void {
  const existing = waveformUseStyleStates.get(svg);
  if (!color) {
    if (!existing) return;
    for (const [use, href] of existing.originalHrefByUse) {
      use.setAttribute("href", href);
      use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
    }
    existing.defs.remove();
    waveformUseStyleStates.delete(svg);
    return;
  }
  if (existing?.color === color) return;
  const sprite = svg.ownerDocument.querySelector<SVGSVGElement>("svg[data-wavedrom-definition-sprite]");
  if (!sprite) return;
  const state = existing ?? {
    color,
    defs: svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "defs"),
    originalHrefByUse: new Map<SVGUseElement, string>(),
  };
  state.color = color;
  state.defs.setAttribute("data-waveform-style-defs", "");
  if (!state.defs.isConnected) svg.insertBefore(state.defs, svg.firstChild);
  else state.defs.replaceChildren();
  const styledIds = new Map<string, string>();
  for (const use of Array.from(svg.querySelectorAll<SVGUseElement>("use"))) {
    const currentHref = use.getAttribute("href") ?? use.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
    const sourceHref = state.originalHrefByUse.get(use) ?? currentHref;
    state.originalHrefByUse.set(use, sourceHref);
    if (!sourceHref.startsWith("#")) continue;
    const sourceId = sourceHref.slice(1);
    let styledId = styledIds.get(sourceId);
    if (!styledId) {
      const source = sprite.querySelector<SVGGElement>(`#${CSS.escape(sourceId)}`);
      if (!source) continue;
      const clone = source.cloneNode(true) as SVGGElement;
      styledId = `wave-style-symbol-${++nextWaveformStyleSymbolId}`;
      clone.id = styledId;
      for (const node of [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))]) {
        if (Array.from(node.classList).some((className) => classes.has(className))) node.style.setProperty("stroke", color, "important");
      }
      state.defs.append(clone);
      styledIds.set(sourceId, styledId);
    }
    const styledHref = `#${styledId}`;
    use.setAttribute("href", styledHref);
    use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", styledHref);
  }
  waveformUseStyleStates.set(svg, state);
}

function applyWaveformStyle(owner: HTMLElement, parsed: ReturnType<typeof parseWaveformStyle>): void {
  // Canvas-painted owner (no SVG): the painter reads the color from the owner and repaints on this event.
  if (owner.querySelector("canvas[data-wave-canvas]")) {
    if ((owner.dataset.waveformStyleColor ?? "") !== (parsed.color ?? "")) {
      if (parsed.color) owner.dataset.waveformStyleColor = parsed.color; else delete owner.dataset.waveformStyleColor;
      owner.dispatchEvent(new Event("wave-canvas-restyle"));
    }
    return;
  }
  const image = owner.querySelector<SVGImageElement>("svg > image[data-wave-svg-image]");
  if (image) {
    const source = image.dataset.waveSvgSource;
    if (!source) return;
    const state = waveformImageStyleStates.get(image) ?? { color: undefined, revision: 0 };
    if (state.color === parsed.color) return;
    state.color = parsed.color;
    const revision = ++state.revision;
    waveformImageStyleStates.set(image, state);
    if (!parsed.color) { image.setAttribute("href", source); return; }
    void fetch(source).then((response) => response.text()).then((markup) => {
      if (waveformImageStyleStates.get(image)?.revision !== revision) return;
      const defaultStrokePattern = new RegExp(`\\.(s\\d+)\\{[^}]*\\bstroke:${WAVEFORM_DEFAULT_STROKE.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b[^}]*\\}`, "g");
      const classes = [...markup.matchAll(defaultStrokePattern)].map((match) => match[1]);
      if (classes.length === 0) { image.setAttribute("href", source); return; }
      const overrides = classes.map((className) => `.${className}{stroke:${parsed.color} !important}`).join("");
      const colored = markup.replace(/<\/svg>\s*$/i, `<style>${overrides}</style></svg>`);
      image.setAttribute("href", `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`);
    }).catch(() => {
      if (waveformImageStyleStates.get(image)?.revision === revision) image.setAttribute("href", source);
    });
    return;
  }
  const OVERRIDE_ATTR = "data-waveform-style-override";
  const existing = owner.querySelector(`style[${OVERRIDE_ATTR}]`);
  const embedded = owner.querySelector("svg > style");
  const defaultStrokePattern = new RegExp(`\\.(s\\d+)\\{[^}]*\\bstroke:${WAVEFORM_DEFAULT_STROKE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^}]*\\}`, "g");
  const classNames = Array.from((embedded?.textContent ?? "").matchAll(defaultStrokePattern), (match) => match[1])
    .filter((className): className is string => className !== undefined);
  const svg = owner.querySelector<SVGSVGElement>("svg");
  if (svg) applySharedSymbolWaveformColor(svg, parsed.color, new Set(classNames));
  if (!parsed.color) { existing?.remove(); return; }
  if (classNames.length === 0) { existing?.remove(); return; }
  const signalId = owner.dataset.signalId ?? "";
  const selector = classNames.map((className) => `[data-role="wave-owner"][data-signal-id="${CSS.escape(signalId)}"] svg .${className}`).join(",");
  const rule = `${selector}{stroke:${parsed.color} !important}`;
  const style = existing ?? owner.ownerDocument.createElement("style");
  if (!existing) { style.setAttribute(OVERRIDE_ATTR, ""); owner.append(style); }
  if (style.textContent !== rule) style.textContent = rule;
}

function applyDisplayStyle(shell: HTMLElement, row: RowLayoutEntry): void {
  applyTextStyle(shell, parseTextStyle(row.displayStyle));
  if (row.displayAlign) shell.style.textAlign = row.displayAlign; else shell.style.removeProperty("text-align");
  if (row.displayOverflow === "wrap") { shell.style.whiteSpace = "normal"; shell.style.textOverflow = "clip"; } else if (row.displayOverflow === "expand") { shell.style.whiteSpace = "nowrap"; shell.style.textOverflow = "clip"; } else { shell.style.whiteSpace = "nowrap"; shell.style.textOverflow = "ellipsis"; }
}

function place(element: HTMLElement, row: Pick<RowLayoutEntry, "y" | "height">): void {
  const transform = `translateY(${row.y}px)`;
  const height = `${row.height}px`;
  if (element.style.transform !== transform) element.style.transform = transform;
  if (element.style.height !== height) element.style.height = height;
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
