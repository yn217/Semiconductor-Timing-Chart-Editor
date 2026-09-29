import type { GroupHeaderLayoutEntry, RenderProjection, RowLayoutEntry } from "@timing-chart-v2/projection";
import { ANNOTATION_LABEL_LINE_HEIGHT, ANNOTATION_LABEL_MAX_WIDTH, wrapAnnotationLabel } from "@timing-chart-v2/geometry";
import { LEFT_TREE_ICON_DOTS, LEFT_TREE_ICON_PATHS, LEFT_TREE_ICON_PUPIL, type LeftTreeIconPathName } from "./left-tree-icon-spec.js";
import type { AnnotationOverlayPrimitive, EdgeCounterOverlayPrimitive, RenderCounters, RendererDiagnosticSummary, RendererDiagnostics, RendererRowIdentitySnapshot, SnapGuidePrimitive, TimingChartRenderer, WaveformSurfaceProvider, WaveMountBatchItem, WaveMountRequest, WaveSignalId } from "./types.js";
import { groupBackgroundColor } from "./group-background.js";

export function isWaveMountRequestFresh(request: Pick<WaveMountRequest, "documentEpoch" | "isFresh">, currentDocumentEpoch: number): boolean {
  return (request.documentEpoch === undefined || request.documentEpoch === currentDocumentEpoch) && (request.isFresh?.() ?? true);
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

function createLeftTreeIcon(document: Document, name: LeftTreeIconPathName | "more" | "comment", className: string): SVGSVGElement {
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
  if (name in LEFT_TREE_ICON_PATHS) {
    const path = append("path");
    const pathName = name as LeftTreeIconPathName;
    path.setAttribute("d", LEFT_TREE_ICON_PATHS[pathName]);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", pathName.startsWith("chevron") ? "2" : "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (pathName === "eye") {
      const pupil = append("circle");
      pupil.setAttribute("cx", String(LEFT_TREE_ICON_PUPIL.cx));
      pupil.setAttribute("cy", String(LEFT_TREE_ICON_PUPIL.cy));
      pupil.setAttribute("r", String(LEFT_TREE_ICON_PUPIL.r));
      pupil.setAttribute("fill", "none");
      pupil.setAttribute("stroke", "currentColor");
      pupil.setAttribute("stroke-width", "1.6");
    }
  } else if (name === "more") {
    for (const { cx, cy, r } of LEFT_TREE_ICON_DOTS) {
      const dot = append("circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", String(r));
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
  #diagnostics: RendererDiagnostics = { projectionUpdates: 0, mountedRows: 0, mountedWaveOwners: 0, cachedWaveOwners: 0, waveOwnerCacheLimit: 32, domNodeCreates: 0, domNodeDestroys: 0, domNodeMoves: 0, waveArtifactCacheHits: 0, waveArtifactCacheMisses: 0, waveArtifactDisposals: 0, waveRendersBySignal: {}, localGeometryBuildsBySignal: {}, annotationResolvePasses: 0, resolvedAnnotations: 0, waveBatchCount: 0, waveBatchFrameYields: 0, waveBatchMaxSize: 0, waveBatchPending: 0, rowsVisited: 0, fullRowScans: 0, waveRendersBySignalCount: 0, localGeometryBuildsBySignalCount: 0, documentEpoch: 0, rowYSize: 0, rowYStaleCount: 0, rowYPrunePasses: 0, dirtyWaveSize: 0, waveVersionSize: 0, fullReplaceEpochResets: 0, staleWaveResultsDropped: 0, diagnosticMapPrunePasses: 0, diagnosticSerializationCount: 0, diagnosticSerializationBytes: 0, diagnosticSerializationDurationMs: 0, diagnosticStringifyCount: 0, diagnosticStringifyDurationMs: 0, diagnosticEncodingCount: 0, diagnosticEncodingDurationMs: 0, diagnosticPublishCount: 0, diagnosticPublishDurationMs: 0 };

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
    // #625: the time-domain layers live in one TimelineViewport wrapper (`display: contents` except in Cycle mode, where CSS makes
    // it the horizontal scroll owner so the fixed columns are never inside a horizontal overflow box).
    const timelineViewport = element(host, "div", "timeline-viewport");
    for (const layer of [timing, waves, overlays, interactive]) timelineViewport.append(layer);
    for (const layer of [left, frozen, timelineViewport]) root.append(layer);
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

  updatePresentation(projection: RenderProjection): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before update.");
    assertCrossSurfaceInvariant(projection);
    const rows = this.#indexedRows(projection.rowLayout, false);
    const navigationRows = this.#indexedRows(projection.navigationRowLayout, true);
    syncShellLayer(layers.left, this.#leftRows, projection.leftRowIds, navigationRows, "left");
    syncShellLayer(layers.frozen, this.#frozenRows, projection.frozenLabelRowIds, rows, "frozen");
    syncShellLayer(layers.timing, this.#timingRows, projection.timingRowIds, rows, "timing");
    for (const signalId of projection.mountedSignalIds) {
      const owner = this.#waveOwners.get(signalId);
      const row = rows.get(signalId);
      if (!owner || !row) continue;
      owner.dataset.pinnedRow = String(row.pinned === true);
      applyWaveformStyle(owner, parseWaveformStyle(row.displayStyle));
    }
    this.#rowLayoutSource = projection.rowLayout;
    this.#rowIndex = new Map(rows);
    this.#navigationRowLayoutSource = projection.navigationRowLayout;
    this.#navigationRowIndex = new Map(navigationRows);
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
      // The Canonical Annotation ID is the sole identity authority. Keep
      // semantic identity and the accessible root contract synchronized on
      // every projection pass, before the signature fast-path: an overlay
      // owner may be recycled by the renderer/DOM without being recreated.
      owner.dataset.annotationId = primitive.id;
      owner.setAttribute("role", "button");
      owner.tabIndex = 0;
      // Keep all identity-bearing metadata current even when the visual body
      // is unchanged. Virtualized callers may recycle an owner between
      // projections, so accessibility and kind metadata must not depend on
      // the visual signature fast path below.
      syncOverlayIdentity(owner, primitive);
      if (this.#overlaySignatures.get(primitive.id) === signature) continue;
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

function syncOverlayIdentity(owner: HTMLElement, primitive: AnnotationOverlayPrimitive): void {
  owner.dataset.annotationType = primitive.type;
  owner.dataset.annotationShape = primitive.shape;
  owner.dataset.visible = String(primitive.visible);
  owner.dataset.lineType = primitive.lineType ?? "straight";
  owner.dataset.arrowhead = primitive.arrowhead ?? "none";
  if (primitive.measurementLane !== undefined) owner.dataset.measurementLane = String(primitive.measurementLane);
  else delete owner.dataset.measurementLane;
  if (primitive.measurementLayout) owner.dataset.measurementArrowLayout = primitive.measurementLayout.arrowLayout;
  else delete owner.dataset.measurementArrowLayout;
  if (primitive.sourceSignalId) owner.dataset.sourceSignalId = primitive.sourceSignalId;
  else delete owner.dataset.sourceSignalId;
  if (primitive.traceOffsetCycles !== undefined) owner.dataset.traceOffsetCycles = String(primitive.traceOffsetCycles);
  else delete owner.dataset.traceOffsetCycles;
  owner.dataset.locked = String(primitive.locked ?? false);
  owner.setAttribute("aria-label", `${primitive.type}: ${primitive.label}${primitive.locked ? " (locked)" : ""}`);
}

function renderOverlay(owner: HTMLElement, primitive: AnnotationOverlayPrimitive): void {
  syncOverlayIdentity(owner, primitive);
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

  // #418: a Measurement's dimension line/label is placed 18px-per-lane
  // *above* its anchors by default -- but when the topmost anchor is on
  // (or near) the first row, that pushes the line/label above local
  // y=RULER_SAFE_AREA_HEIGHT, into the surface-host's own reserved top
  // padding (center-columns.css's `.surface-host { padding-top: 34px }`,
  // matching `.cycle-ruler`'s own 34px height) -- the sticky Cycle Ruler
  // occupies exactly that band at the top of the scrollable content, at
  // any scroll position, so anything placed above it there is hidden
  // behind/under the Ruler. Flip to placing the dimension line *below*
  // the anchors instead whenever the "above" placement would intrude on
  // that reserved band, so a Measurement starting on the top-row Signal
  // stays fully inside the visible canvas. `measurementPlacedBelow` also
  // drives the label's default offset direction below.
  const RULER_SAFE_AREA_HEIGHT = 34;
  const measurementLaneOffset = primitive.type === "measurement" && primitive.measurementLane !== undefined ? 18 * (primitive.measurementLane + 1) : undefined;
  const measurementPlacedBelow = measurementLaneOffset !== undefined && Math.min(first.y, second.y) - measurementLaneOffset < RULER_SAFE_AREA_HEIGHT;
  const dimensionY = measurementLaneOffset === undefined
    ? undefined
    : measurementPlacedBelow ? Math.max(first.y, second.y) + measurementLaneOffset : Math.min(first.y, second.y) - measurementLaneOffset;
  if (measurementLaneOffset !== undefined) owner.dataset.measurementSide = measurementPlacedBelow ? "below" : "above";
  else delete owner.dataset.measurementSide;
  const lineFirst = dimensionY === undefined ? first : { x: first.x, y: dimensionY };
  const lineSecond = dimensionY === undefined ? second : { x: second.x, y: dimensionY };
  // Additive on top of any anchor-derived angle below -- never replaces it,
  // so line-shaped overlays keep auto-orienting from their two anchors and
  // this only rotates further on top of that.
  const rotationDeg = primitive.rotation ?? 0;
  const rotateSuffix = rotationDeg === 0 ? "" : ` rotate(${rotationDeg}deg)`;
  if (primitive.shape === "point") {
    body.style.transform = `translate(${first.x}px, ${first.y}px)${rotateSuffix}`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "vertical") {
    body.style.transform = `translateX(${first.x}px)${rotateSuffix}`;
    body.style.height = `${primitive.surfaceHeight}px`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "range") {
    body.style.transform = `translate(${Math.min(first.x, second.x)}px, 0px)${rotateSuffix}`;
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
    if (rotationDeg !== 0) body.style.transform = `rotate(${rotationDeg}deg)`;
    body.dataset.annotationField = first.field;
  } else {
    renderLineBody(body, primitive, lineFirst, lineSecond, rotationDeg);
    body.dataset.annotationField = first.field;
  }
  if (primitive.type === "marker" && primitive.verticalExtent) {
    body.style.height = `${Math.max(2, primitive.verticalExtent.bottom - primitive.verticalExtent.top)}px`;
    body.style.transform = `translate(${first.x}px, ${primitive.verticalExtent.top}px)${rotateSuffix}`;
  }
  // #378: independent Stroke width/style and Fill color/opacity, applied as
  // inline style overrides on top of the shape's existing CSS defaults (see
  // center-columns.css's [data-annotation-type=...] [data-role="annotation-
  // body"] rules) -- an absent value here leaves that CSS default in place,
  // so a document with no Stroke/Fill authored looks exactly as before.
  const presentation = parsePresentationStyle(primitive.style);
  if (presentation.strokeWidth !== undefined) body.style.borderWidth = `${presentation.strokeWidth}px`; else body.style.removeProperty("border-width");
  if (presentation.strokeStyle !== undefined) body.style.borderStyle = presentation.strokeStyle; else body.style.removeProperty("border-style");
  if (presentation.fillColor !== undefined || presentation.fillOpacity !== undefined) {
    const base = presentation.fillColor === "none" ? undefined : presentation.fillColor ?? primitive.color ?? "#d04a36";
    body.style.backgroundColor = base === undefined ? "transparent" : `color-mix(in srgb, ${base} ${Math.round((presentation.fillOpacity ?? 0.12) * 100)}%, transparent)`;
  } else body.style.removeProperty("background-color");
  const label = document.createElement("span");
  label.dataset.role = "annotation-label";
  label.dataset.annotationLabel = "true";
  const labelPresentation = parsePresentationStyle(primitive.style);
  const textStyle = parseTextStyle(primitive.style);
  label.textContent = labelPresentation.labelWrap === false ? primitive.label : wrapAnnotationLabel(primitive.label, labelPresentation.labelMaxWidth ?? ANNOTATION_LABEL_MAX_WIDTH.default, textStyle.fontSize);
  // Authored label layout remains presentation-only but follows the same
  // persisted style consumed by ExportScene. Missing fields retain the
  // historical 180px wrap behavior.
  label.style.whiteSpace = "pre";
  label.style.maxWidth = "none";
  applyTextStyle(label, textStyle);
  if (primitive.align) label.style.textAlign = primitive.align; else label.style.removeProperty("text-align");
  const labelMidpoint = { x: (lineFirst.x + lineSecond.x) / 2, y: (lineFirst.y + lineSecond.y) / 2 };
  const labelAnchor = primitive.labelPlacement === "start" ? first
    : primitive.labelPlacement === "end" ? second
    : labelMidpoint;
  const labelBaseY = primitive.labelPlacement === "above" ? labelMidpoint.y - 14
    : primitive.labelPlacement === "below" ? labelMidpoint.y + 14
    : labelAnchor.y;
  label.style.transform = `translate(${labelAnchor.x + (primitive.labelOffset?.x ?? 0)}px, ${labelBaseY + (primitive.labelOffset?.y ?? (measurementPlacedBelow ? 14 : -14))}px)`;
  // #378: a real (SVG, not Unicode) lock glyph -- `label` is already
  // `position: absolute` (center-columns.css), which makes it a containing
  // block for this glyph's own `position: absolute`, so it rides along with
  // the label's translate() with no extra positioning math needed here.
  if (primitive.locked) {
    const svgNs = "http://www.w3.org/2000/svg";
    const lock = document.createElementNS(svgNs, "svg");
    lock.dataset.role = "annotation-lock-glyph";
    lock.setAttribute("viewBox", "0 0 10 10");
    lock.setAttribute("aria-hidden", "true");
    lock.style.position = "absolute";
    lock.style.left = "-14px";
    lock.style.top = "2px";
    lock.style.width = "10px";
    lock.style.height = "10px";
    lock.style.color = "#334155";
    const shackle = document.createElementNS(svgNs, "path");
    shackle.setAttribute("d", "M 2.5 4 V 2.5 A 2.5 2.5 0 0 1 7.5 2.5 V 4");
    shackle.setAttribute("fill", "none");
    shackle.setAttribute("stroke", "currentColor");
    shackle.setAttribute("stroke-width", "1.2");
    const body2 = document.createElementNS(svgNs, "rect");
    body2.setAttribute("x", "1.5"); body2.setAttribute("y", "4"); body2.setAttribute("width", "7"); body2.setAttribute("height", "5.5"); body2.setAttribute("rx", "1");
    body2.setAttribute("fill", "currentColor");
    lock.append(shackle, body2);
    label.append(lock);
  }
  const dimensionParts: HTMLElement[] = [];
  if (primitive.type === "measurement" && primitive.measurementLayout && dimensionY !== undefined) {
    const layout = primitive.measurementLayout;
    const addMarker = (anchor: typeof first, side: "start" | "end", kind: "none" | "bar" | "arrow") => {
      if (kind === "none") return;
      const marker = document.createElement("span");
      marker.dataset.role = "measurement-marker";
      marker.dataset.markerSide = side;
      marker.dataset.markerKind = kind;
      marker.dataset.arrowLayout = layout.arrowLayout;
      marker.style.transform = `translate(${anchor.x}px, ${dimensionY}px)`;
      dimensionParts.push(marker);
    };
    const addExtension = (anchor: typeof first, side: "start" | "end") => {
      if (!(layout.extensionLines === "both" || layout.extensionLines === side)) return;
      const extension = document.createElement("span");
      extension.dataset.role = "measurement-extension";
      extension.dataset.extensionSide = side;
      extension.style.height = `${Math.abs(dimensionY - anchor.y)}px`;
      extension.style.transform = `translate(${anchor.x}px, ${Math.min(anchor.y, dimensionY)}px)`;
      dimensionParts.push(extension);
    };
    addMarker(first, "start", layout.startMarker);
    addMarker(second, "end", layout.endMarker);
    addExtension(first, "start");
    addExtension(second, "end");
  }
  const handles = primitive.anchors.map((anchor) => {
    const handle = document.createElement("span");
    handle.dataset.role = "annotation-handle";
    handle.dataset.annotationField = anchor.field;
    if (anchor.threshold !== undefined) handle.dataset.anchorThreshold = String(anchor.threshold);
    if (anchor.transitionKind !== undefined) handle.dataset.anchorTransitionKind = anchor.transitionKind;
    handle.style.transform = `translate(${anchor.x}px, ${anchor.y}px)`;
    return handle;
  });
  owner.replaceChildren(body, label, ...dimensionParts, ...handles);
}

type LinePoint = Readonly<{ x: number; y: number }>;

function svgFragmentId(id: string): string {
  // Stable IDs are opaque. Encode every code point rather than assuming an
  // identifier grammar or allowing two different IDs to sanitize alike.
  return Array.from(id, (character) => (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0")).join("_");
}

function linePath(lineType: NonNullable<AnnotationOverlayPrimitive["lineType"]>, first: LinePoint, second: LinePoint): { readonly d: string; readonly points: readonly LinePoint[]; readonly dash?: string } {
  if (lineType === "orthogonal") {
    const bendX = (first.x + second.x) / 2;
    const bends = [{ x: bendX, y: first.y }, { x: bendX, y: second.y }];
    const firstBend = bends[0]!;
    const secondBend = bends[1]!;
    return { d: `M ${first.x} ${first.y} L ${firstBend.x} ${firstBend.y} L ${secondBend.x} ${secondBend.y} L ${second.x} ${second.y}`, points: [first, firstBend, secondBend, second] };
  }
  if (lineType === "curve") {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const offset = Math.max(14, length * 0.24);
    const normal = { x: -dy / length * offset, y: dx / length * offset };
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const control = { x: midpoint.x + normal.x, y: midpoint.y + normal.y };
    return { d: `M ${first.x} ${first.y} Q ${control.x} ${control.y} ${second.x} ${second.y}`, points: [first, control, second] };
  }
  if (lineType === "diagonal") {
    // #375: Diagonal must have genuinely distinct path geometry from
    // Straight, not merely a different stroke pattern on an identical
    // path -- a route bent through a single 45-degree elbow (unlike
    // Orthogonal's axis-aligned 90-degree bend, and unlike Straight's
    // single direct segment at whatever angle the two anchors happen to
    // form). Runs diagonally for min(|dx|, |dy|), then finishes straight
    // along whichever axis has the remaining distance.
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const run = Math.min(Math.abs(dx), Math.abs(dy));
    const bend = { x: first.x + Math.sign(dx || 1) * run, y: first.y + Math.sign(dy || 1) * run };
    return { d: `M ${first.x} ${first.y} L ${bend.x} ${bend.y} L ${second.x} ${second.y}`, points: [first, bend, second], dash: "7 4" };
  }
  // Straight is a direct single segment between the two anchors.
  return { d: `M ${first.x} ${first.y} L ${second.x} ${second.y}`, points: [first, second] };
}

function renderLineBody(body: HTMLElement, primitive: AnnotationOverlayPrimitive, first: LinePoint, second: LinePoint, rotationDeg: number): void {
  const lineType = primitive.lineType ?? "straight";
  const path = linePath(lineType, first, second);
  const padding = 10;
  const minX = Math.min(...path.points.map((point) => point.x)) - padding;
  const minY = Math.min(...path.points.map((point) => point.y)) - padding;
  const width = Math.max(20, Math.max(...path.points.map((point) => point.x)) - minX + padding);
  const height = Math.max(20, Math.max(...path.points.map((point) => point.y)) - minY + padding);
  const toLocal = (point: LinePoint): LinePoint => ({ x: point.x - minX, y: point.y - minY });
  const localFirst = toLocal(first);
  const localSecond = toLocal(second);
  const localPoints = path.points.map(toLocal);
  const localPath = lineType === "orthogonal"
    ? `M ${localPoints[0]!.x} ${localPoints[0]!.y} L ${localPoints[1]!.x} ${localPoints[1]!.y} L ${localPoints[2]!.x} ${localPoints[2]!.y} L ${localPoints[3]!.x} ${localPoints[3]!.y}`
    : lineType === "curve"
      ? `M ${localFirst.x} ${localFirst.y} Q ${localPoints[1]!.x} ${localPoints[1]!.y} ${localSecond.x} ${localSecond.y}`
      // #375: Diagonal's 45-degree elbow (see linePath above) is a 3-point,
      // 2-segment path -- localPoints[1] is the bend point.
      : lineType === "diagonal"
        ? `M ${localFirst.x} ${localFirst.y} L ${localPoints[1]!.x} ${localPoints[1]!.y} L ${localSecond.x} ${localSecond.y}`
        : `M ${localFirst.x} ${localFirst.y} L ${localSecond.x} ${localSecond.y}`;
  const svgDocument = body.ownerDocument;
  const svg = svgDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  const pathElement = svgDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  const defs = svgDocument.createElementNS("http://www.w3.org/2000/svg", "defs");
  const markerId = `annotation-arrow-${svgFragmentId(primitive.id)}`;
  const marker = (suffix: string, reverse: boolean) => {
    const result = svgDocument.createElementNS("http://www.w3.org/2000/svg", "marker");
    result.setAttribute("id", `${markerId}-${suffix}`);
    result.setAttribute("markerWidth", "8");
    result.setAttribute("markerHeight", "8");
    result.setAttribute("refX", reverse ? "1" : "7");
    result.setAttribute("refY", "4");
    result.setAttribute("orient", "auto-start-reverse");
    result.setAttribute("markerUnits", "strokeWidth");
    const head = svgDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    head.setAttribute("d", reverse ? "M 8 0 L 0 4 L 8 8 Z" : "M 0 0 L 8 4 L 0 8 Z");
    head.setAttribute("fill", primitive.color ?? "#d04a36");
    result.append(head);
    return result;
  };
  const arrowhead = primitive.arrowhead ?? "none";
  if (arrowhead === "start" || arrowhead === "bidirectional") defs.append(marker("start", true));
  if (arrowhead === "end" || arrowhead === "bidirectional") defs.append(marker("end", false));
  svg.append(defs);
  svg.dataset.role = "annotation-line";
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  pathElement.dataset.role = "annotation-path";
  pathElement.dataset.lineType = lineType;
  pathElement.setAttribute("d", localPath);
  pathElement.setAttribute("fill", "none");
  pathElement.setAttribute("stroke", primitive.color ?? "#d04a36");
  pathElement.setAttribute("stroke-width", "2");
  pathElement.setAttribute("stroke-linecap", "round");
  pathElement.setAttribute("stroke-linejoin", "round");
  if (path.dash) pathElement.setAttribute("stroke-dasharray", path.dash);
  if (arrowhead === "start" || arrowhead === "bidirectional") pathElement.setAttribute("marker-start", `url(#${markerId}-start)`);
  if (arrowhead === "end" || arrowhead === "bidirectional") pathElement.setAttribute("marker-end", `url(#${markerId}-end)`);
  if (rotationDeg !== 0) pathElement.setAttribute("transform", `rotate(${rotationDeg} ${(localFirst.x + localSecond.x) / 2} ${(localFirst.y + localSecond.y) / 2})`);
  svg.append(pathElement);
  if (primitive.type === "bracket") {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const capX = -dy / length * 6;
    const capY = dx / length * 6;
    const caps = svgDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    caps.dataset.role = "annotation-bracket-caps";
    caps.setAttribute("d", `M ${localFirst.x - capX} ${localFirst.y - capY} L ${localFirst.x + capX} ${localFirst.y + capY} M ${localSecond.x - capX} ${localSecond.y - capY} L ${localSecond.x + capX} ${localSecond.y + capY}`);
    caps.setAttribute("fill", "none");
    caps.setAttribute("stroke", primitive.color ?? "#d04a36");
    caps.setAttribute("stroke-width", "2");
    caps.setAttribute("stroke-linecap", "round");
    if (rotationDeg !== 0) caps.setAttribute("transform", `rotate(${rotationDeg} ${(localFirst.x + localSecond.x) / 2} ${(localFirst.y + localSecond.y) / 2})`);
    svg.append(caps);
  }
  body.dataset.lineRenderer = "svg";
  body.dataset.orthogonalDirection = `${second.x - first.x < 0 ? "left" : "right"}-${second.y - first.y < 0 ? "up" : "down"}`;
  body.style.transform = `translate(${minX}px, ${minY}px)`;
  body.style.width = `${width}px`;
  body.style.height = `${height}px`;
  body.replaceChildren(svg);
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
    const headerBackground = groupStyleApplies && header.groupStyle?.showBackground
      ? groupBackgroundColor(header.groupStyle.background, header.groupStyle.opacity)
      : undefined;
    if (headerBackground) shell.style.setProperty("--group-background", headerBackground);
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

/** Parses and validates the shared text-style JsonObject shape (used by
 * Signal/CommentRow display.style and Annotation.style alike) into typed,
 * safe-to-apply CSS values. One validation pass, reused by every entity
 * kind that can carry this style -- no second copy of these regexes. */
/** #378: Stroke (independent width/style) and Fill (independent color/
 * opacity) for the CSS-border/background-driven Annotation shapes (see
 * apps/editor/src/annotation-capability-matrix.ts's STROKE_CAPABLE/
 * FILL_CAPABLE for exactly which types). Same permissive-parse-from-a-
 * free-form-JsonObject convention as parseTextStyle below -- an absent or
 * malformed value here means "use the shape's existing CSS default",
 * never a thrown error or a garbage inline style. */
function parsePresentationStyle(style: Record<string, unknown> | undefined): { readonly strokeWidth?: number | undefined; readonly strokeStyle?: "solid" | "dashed" | "dotted" | undefined; readonly fillColor?: string | undefined; readonly fillOpacity?: number | undefined; readonly labelWrap?: boolean | undefined; readonly labelMaxWidth?: number | undefined } {
  const source = style ?? {};
  return {
    strokeWidth: typeof source.strokeWidth === "number" && source.strokeWidth >= 1 && source.strokeWidth <= 8 ? source.strokeWidth : undefined,
    strokeStyle: source.strokeStyle === "solid" || source.strokeStyle === "dashed" || source.strokeStyle === "dotted" ? source.strokeStyle : undefined,
    fillColor: typeof source.fillColor === "string" && (source.fillColor === "none" || /^#[0-9a-f]{3,8}$/i.test(source.fillColor)) ? source.fillColor : undefined,
    fillOpacity: typeof source.fillOpacity === "number" && source.fillOpacity >= 0 && source.fillOpacity <= 1 ? source.fillOpacity : undefined,
    labelWrap: typeof source.labelWrap === "boolean" ? source.labelWrap : undefined,
    labelMaxWidth: typeof source.labelMaxWidth === "number" && source.labelMaxWidth >= ANNOTATION_LABEL_MAX_WIDTH.min && source.labelMaxWidth <= ANNOTATION_LABEL_MAX_WIDTH.max ? source.labelMaxWidth : undefined,
  };
}

function parseTextStyle(style: Record<string, unknown> | undefined): { readonly color?: string | undefined; readonly background?: string | undefined; readonly fontWeight?: string | undefined; readonly fontStyle?: string | undefined; readonly fontFamily?: string | undefined; readonly fontSize?: number | undefined; readonly textDecoration?: string | undefined; readonly lineHeight?: number | undefined } {
  const source = style ?? {};
  return {
    color: typeof source.color === "string" && /^#[0-9a-f]{3,8}$/i.test(source.color) ? source.color : undefined,
    background: typeof source.background === "string" && /^#[0-9a-f]{3,8}$/i.test(source.background) ? source.background : undefined,
    fontWeight: typeof source.fontWeight === "string" && /^(normal|bold|[1-9]00)$/.test(source.fontWeight) ? source.fontWeight : undefined,
    fontStyle: source.fontStyle === "italic" || source.fontStyle === "normal" ? source.fontStyle : undefined,
    fontFamily: typeof source.fontFamily === "string" && source.fontFamily.length <= 120 ? source.fontFamily : undefined,
    fontSize: typeof source.fontSize === "number" && source.fontSize >= 6 && source.fontSize <= 48 ? source.fontSize : undefined,
    textDecoration: typeof source.textDecoration === "string" && /^(|underline|line-through|underline line-through)$/.test(source.textDecoration) ? source.textDecoration : undefined,
    lineHeight: typeof source.lineHeight === "number" && source.lineHeight >= ANNOTATION_LABEL_LINE_HEIGHT.min && source.lineHeight <= ANNOTATION_LABEL_LINE_HEIGHT.max ? source.lineHeight : undefined,
  };
}

/** Applies a parsed text style to an element's inline style + the
 * color-tracking dataset attribute already used by signal-row shells. */
function applyTextStyle(element: HTMLElement, parsed: ReturnType<typeof parseTextStyle>): void {
  if (parsed.color) { element.style.color = parsed.color; element.dataset.signalStyleColor = parsed.color; } else { element.style.removeProperty("color"); delete element.dataset.signalStyleColor; }
  if (parsed.background) element.style.backgroundColor = parsed.background; else element.style.removeProperty("background-color");
  if (parsed.fontWeight) element.style.fontWeight = parsed.fontWeight; else element.style.removeProperty("font-weight");
  if (parsed.fontStyle) element.style.fontStyle = parsed.fontStyle; else element.style.removeProperty("font-style");
  if (parsed.fontFamily) element.style.fontFamily = parsed.fontFamily; else element.style.removeProperty("font-family");
  if (parsed.fontSize) element.style.fontSize = `${parsed.fontSize}px`; else element.style.removeProperty("font-size");
  if (parsed.textDecoration !== undefined) element.style.textDecoration = parsed.textDecoration; else element.style.removeProperty("text-decoration");
  if (parsed.lineHeight) element.style.lineHeight = String(parsed.lineHeight); else element.style.removeProperty("line-height");
}

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
