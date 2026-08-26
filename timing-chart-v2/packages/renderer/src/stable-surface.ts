import type { RenderProjection, RowLayoutEntry } from "@timing-chart-v2/projection";
import type { AnnotationOverlayPrimitive, EdgeCounterOverlayPrimitive, RenderCounters, RendererDiagnostics, SnapGuidePrimitive, TimingChartRenderer, WaveformSurfaceProvider, WaveSignalId } from "./types.js";

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
  readonly #waveOwners = new Map<WaveSignalId, HTMLElement>();
  readonly #overlayOwners = new Map<string, HTMLElement>();
  readonly #overlaySignatures = new Map<string, string>();
  readonly #edgeCounterOwners = new Map<string, HTMLElement>();
  readonly #dirtyWaves = new Set<WaveSignalId>();
  readonly #waveVersions = new Map<WaveSignalId, number>();
  readonly #wavePending = new Set<WaveSignalId>();
  readonly #rowY = new Map<string, number>();
  readonly #pending = new Set<Promise<void>>();
  #layers: Layers | undefined;
  #counters: RenderCounters = { waveDromRenders: 0, localGeometryBuilds: 0, rowPositionUpdates: 0, overlayUpdates: 0 };
  #diagnostics: RendererDiagnostics = { projectionUpdates: 0, mountedRows: 0, mountedWaveOwners: 0, cachedWaveOwners: 0, waveOwnerCacheLimit: 32, domNodeCreates: 0, domNodeDestroys: 0, domNodeMoves: 0, waveArtifactCacheHits: 0, waveArtifactCacheMisses: 0, waveArtifactDisposals: 0, waveRendersBySignal: {}, localGeometryBuildsBySignal: {}, annotationResolvePasses: 0, resolvedAnnotations: 0 };

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
    for (const layer of [left, frozen, timing, waves, overlays, interactive]) root.append(layer);
    host.replaceChildren(root);
    this.#layers = { root, left, frozen, timing, waves, overlays, interactive };
    this.#publishCounters();
  }

  update(projection: RenderProjection): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before update.");
    assertCrossSurfaceInvariant(projection);
    this.#diagnostics = { ...this.#diagnostics, projectionUpdates: this.#diagnostics.projectionUpdates + 1, mountedRows: projection.mountedRowIds.length };
    const rows = new Map(projection.rowLayout.map((row) => [row.rowId, row]));
    const changedRows = new Set<string>();
    for (const row of projection.rowLayout) {
      if (this.#rowY.get(row.rowId) !== row.y) changedRows.add(row.rowId);
      this.#rowY.set(row.rowId, row.y);
    }
    this.#counters = { ...this.#counters, rowPositionUpdates: this.#counters.rowPositionUpdates + changedRows.size };
    const shellStats = [syncShellLayer(layers.left, this.#leftRows, projection.leftRowIds, rows, "left"), syncShellLayer(layers.frozen, this.#frozenRows, projection.frozenLabelRowIds, rows, "frozen"), syncShellLayer(layers.timing, this.#timingRows, projection.timingRowIds, rows, "timing")];
    this.#diagnostics = { ...this.#diagnostics, domNodeCreates: this.#diagnostics.domNodeCreates + shellStats.reduce((sum, item) => sum + item.creates, 0), domNodeDestroys: this.#diagnostics.domNodeDestroys + shellStats.reduce((sum, item) => sum + item.destroys, 0), domNodeMoves: this.#diagnostics.domNodeMoves + shellStats.reduce((sum, item) => sum + item.moves, 0) };
    layers.root.style.height = `${projection.totalHeight}px`;
    layers.root.dataset.revision = String(projection.revision);
    layers.root.dataset.canonicalRowIds = projection.canonicalRowIds.join(",");
    layers.root.dataset.visibleRowIds = projection.visibleRowIds.join(",");

    const canonical = new Set(projection.canonicalSignalIds);
    for (const signalId of projection.waveSignalIds) {
      this.#dirtyWaves.add(signalId);
      this.#waveVersions.set(signalId, (this.#waveVersions.get(signalId) ?? 0) + 1);
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
    for (const row of projection.rowLayout) if (row.kind === "timing" && !firstTimingRowByGroup.has(row.groupId)) firstTimingRowByGroup.set(row.groupId, row.rowId);
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
    this.#diagnostics = { ...this.#diagnostics, mountedWaveOwners: [...this.#waveOwners.values()].filter((owner) => owner.isConnected).length, cachedWaveOwners: this.#waveOwners.size, waveOwnerCacheLimit };
    this.#publishCounters();
  }

  counters(): Readonly<RenderCounters> {
    return Object.freeze({ ...this.#counters });
  }

  diagnostics(): Readonly<RendererDiagnostics> {
    return Object.freeze({ ...this.#diagnostics });
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
    this.#leftRows.clear();
    this.#frozenRows.clear();
    this.#timingRows.clear();
    this.#overlayOwners.clear();
    this.#overlaySignatures.clear();
    this.#edgeCounterOwners.clear();
    this.#rowY.clear();
    this.#layers?.root.remove();
    this.#layers = undefined;
  }

  #queueWave(signalId: WaveSignalId, owner: HTMLElement): void {
    if (this.#wavePending.has(signalId)) return;
    this.#wavePending.add(signalId);
    const version = this.#waveVersions.get(signalId) ?? 0;
    const task = this.#provider.mountWave(signalId, owner).then((delta) => {
      this.#counters = {
        ...this.#counters,
        waveDromRenders: this.#counters.waveDromRenders + delta.waveDromRenders,
        localGeometryBuilds: this.#counters.localGeometryBuilds + delta.localGeometryBuilds,
      };
      const waveRendersBySignal = { ...this.#diagnostics.waveRendersBySignal, [signalId]: (this.#diagnostics.waveRendersBySignal[signalId] ?? 0) + delta.waveDromRenders };
      const localGeometryBuildsBySignal = { ...this.#diagnostics.localGeometryBuildsBySignal, [signalId]: (this.#diagnostics.localGeometryBuildsBySignal[signalId] ?? 0) + delta.localGeometryBuilds };
      this.#diagnostics = { ...this.#diagnostics, waveRendersBySignal, localGeometryBuildsBySignal };
      owner.removeAttribute("data-wave-error");
      if ((this.#waveVersions.get(signalId) ?? 0) === version) this.#dirtyWaves.delete(signalId);
      this.#publishCounters();
    }).catch((error: unknown) => {
      owner.replaceChildren();
      owner.dataset.waveError = error instanceof Error ? error.message : "Unknown waveform render failure";
      this.#publishCounters();
    });
    this.#pending.add(task);
    void task.finally(() => {
      this.#pending.delete(task);
      this.#wavePending.delete(signalId);
      if (owner.isConnected && this.#dirtyWaves.has(signalId) && (this.#waveVersions.get(signalId) ?? 0) !== version) this.#queueWave(signalId, owner);
    });
  }

  #publishCounters(): void {
    if (!this.#layers) return;
    this.#layers.root.dataset.renderCounters = JSON.stringify(this.#counters);
    this.#layers.root.dataset.performanceCounters = JSON.stringify(this.#diagnostics);
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
    if (row.groupStyle?.showBackground && row.groupStyle.background) shell.style.setProperty("--group-background", row.groupStyle.background);
    else shell.style.removeProperty("--group-background");
    if (row.groupStyle?.opacity !== undefined) shell.style.opacity = String(row.groupStyle.opacity); else shell.style.removeProperty("opacity");
    if (row.groupStyle?.border) shell.style.setProperty("--group-border", row.groupStyle.border); else shell.style.removeProperty("--group-border");
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
    const signature = `${row.kind}\u0000${row.name}\u0000${row.groupId}\u0000${row.role ?? ""}\u0000${row.fullPath ?? ""}\u0000${JSON.stringify(row.groupStyle ?? {})}\u0000${JSON.stringify(row.displayStyle ?? {})}\u0000${row.displayAlign ?? ""}\u0000${row.displayOverflow ?? ""}\u0000${row.groupId !== previousGroupId}`;
    if (shell.dataset.shellSignature !== signature) { populateShell(shell, row, surface, row.groupId !== previousGroupId); shell.dataset.shellSignature = signature; }
    place(shell, row);
    ordered.push(shell);
    previousGroupId = row.groupId;
  }
  if (ordered.length !== layer.children.length || ordered.some((shell, index) => layer.children[index] !== shell)) { layer.replaceChildren(...ordered); moves = ordered.length; }
  return { creates, destroys, moves };
}

function populateShell(shell: HTMLElement, row: RowLayoutEntry, surface: string, groupStart: boolean): void {
  if (surface === "timing") return;
  const document = shell.ownerDocument;
  if (surface === "left") {
    const branch = document.createElement("span");
    branch.dataset.role = "tree-branch";
    branch.dataset.groupId = row.groupId;
    branch.draggable = groupStart;
    if (groupStart) {
      branch.setAttribute("aria-label", `Select ${row.groupName} group`);
      const collapse = document.createElement("button");
      collapse.type = "button";
      collapse.dataset.role = "tree-collapse";
      collapse.dataset.groupId = row.groupId;
      collapse.setAttribute("aria-label", `Collapse ${row.groupName} group`);
      collapse.textContent = "⌄";
      branch.append(collapse, document.createTextNode(` ${row.groupName}`));
    } else {
      branch.textContent = "";
    }
    const name = document.createElement("span");
    name.dataset.role = "tree-signal-name";
    name.textContent = row.name;
    name.title = row.fullPath ?? row.name;
    const role = document.createElement("span");
    role.dataset.role = "tree-signal-role";
    role.textContent = row.kind === "comment" ? "▣" : row.role === "input" ? "i" : row.role === "output" ? "o" : "wire";
    role.title = row.kind === "comment" ? "Comment Row" : row.role ?? "internal";
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.dataset.role = "tree-visibility";
    visibility.dataset.treeSignalId = row.rowId;
    visibility.setAttribute("aria-label", `Toggle visibility of ${row.name}`);
    visibility.textContent = "◉";
    const more = document.createElement("button");
    more.type = "button";
    more.dataset.role = "tree-more";
    more.dataset.treeSignalId = row.rowId;
    more.setAttribute("aria-label", `More actions for ${row.name}`);
    more.textContent = "⋮";
    shell.replaceChildren(branch, name, role, visibility, more);
    return;
  }
  const role = document.createElement("span");
  role.dataset.role = "signal-role";
  role.textContent = row.role?.toUpperCase() ?? "";
  const name = document.createElement("span");
  name.dataset.role = "frozen-signal-name";
  name.textContent = row.name;
  shell.replaceChildren(role, name);
}

function applyDisplayStyle(shell: HTMLElement, row: RowLayoutEntry): void {
  const style = row.displayStyle ?? {};
  const color = typeof style.color === "string" && /^#[0-9a-f]{3,8}$/i.test(style.color) ? style.color : undefined;
  const background = typeof style.background === "string" && /^#[0-9a-f]{3,8}$/i.test(style.background) ? style.background : undefined;
  const fontWeight = typeof style.fontWeight === "string" && /^(normal|bold|[1-9]00)$/.test(style.fontWeight) ? style.fontWeight : undefined;
  const fontStyle = style.fontStyle === "italic" || style.fontStyle === "normal" ? style.fontStyle : undefined;
  if (color) { shell.style.color = color; shell.dataset.signalStyleColor = color; } else { shell.style.removeProperty("color"); delete shell.dataset.signalStyleColor; }
  if (background) shell.style.backgroundColor = background; else shell.style.removeProperty("background-color");
  if (fontWeight) shell.style.fontWeight = fontWeight; else shell.style.removeProperty("font-weight");
  if (fontStyle) shell.style.fontStyle = fontStyle; else shell.style.removeProperty("font-style");
  if (row.displayAlign) shell.style.textAlign = row.displayAlign; else shell.style.removeProperty("text-align");
  if (row.displayOverflow === "wrap") { shell.style.whiteSpace = "normal"; shell.style.textOverflow = "clip"; } else if (row.displayOverflow === "expand") { shell.style.whiteSpace = "nowrap"; shell.style.textOverflow = "clip"; } else { shell.style.whiteSpace = "nowrap"; shell.style.textOverflow = "ellipsis"; }
}

function place(element: HTMLElement, row: RowLayoutEntry): void {
  element.style.transform = `translateY(${row.y}px)`;
  element.style.height = `${row.height}px`;
}

function assertCrossSurfaceInvariant(projection: RenderProjection): void {
  const expected = projection.mountedRowIds.join("\u0000");
  if (projection.leftRowIds.join("\u0000") !== expected || projection.frozenLabelRowIds.join("\u0000") !== expected || projection.timingRowIds.join("\u0000") !== expected) {
    throw new Error("Cross-surface row ID invariant failed.");
  }
}
