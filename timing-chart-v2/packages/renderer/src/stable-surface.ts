import type { RenderProjection, RowLayoutEntry } from "@timing-chart-v2/projection";
import type { AnnotationOverlayPrimitive, RenderCounters, SnapGuidePrimitive, TimingChartRenderer, WaveformSurfaceProvider, WaveSignalId } from "./types.js";

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
  readonly #dirtyWaves = new Set<WaveSignalId>();
  readonly #waveVersions = new Map<WaveSignalId, number>();
  readonly #wavePending = new Set<WaveSignalId>();
  readonly #rowY = new Map<string, number>();
  readonly #pending = new Set<Promise<void>>();
  #layers: Layers | undefined;
  #counters: RenderCounters = { waveDromRenders: 0, localGeometryBuilds: 0, rowPositionUpdates: 0, overlayUpdates: 0 };

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
    const rows = new Map(projection.rowLayout.map((row) => [row.rowId, row]));
    const changedRows = new Set<string>();
    for (const row of projection.rowLayout) {
      if (this.#rowY.get(row.rowId) !== row.y) changedRows.add(row.rowId);
      this.#rowY.set(row.rowId, row.y);
    }
    this.#counters = { ...this.#counters, rowPositionUpdates: this.#counters.rowPositionUpdates + changedRows.size };
    syncShellLayer(layers.left, this.#leftRows, projection.leftRowIds, rows, "left");
    syncShellLayer(layers.frozen, this.#frozenRows, projection.frozenLabelRowIds, rows, "frozen");
    syncShellLayer(layers.timing, this.#timingRows, projection.timingRowIds, rows, "timing");
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
    }
    const mounted = new Set(projection.mountedSignalIds);
    for (const [signalId, owner] of this.#waveOwners) if (!mounted.has(signalId)) owner.remove();
    for (const signalId of projection.mountedSignalIds) {
      let owner = this.#waveOwners.get(signalId);
      const isNew = owner === undefined;
      if (!owner) {
        owner = element(layers.root.ownerDocument, "div", "wave-owner");
        owner.dataset.signalId = signalId;
        this.#waveOwners.set(signalId, owner);
      }
      if (!owner.isConnected) layers.waves.append(owner);
      const row = rows.get(signalId);
      if (row) place(owner, row);
      if (isNew || this.#dirtyWaves.has(signalId)) this.#queueWave(signalId, owner);
    }
    this.#publishCounters();
  }

  counters(): Readonly<RenderCounters> {
    return Object.freeze({ ...this.#counters });
  }

  updateOverlays(primitives: readonly AnnotationOverlayPrimitive[]): void {
    const layers = this.#layers;
    if (!layers) throw new Error("Timing chart renderer must be mounted before overlay update.");
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

  async whenIdle(): Promise<void> {
    await Promise.all([...this.#pending]);
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
      owner.removeAttribute("data-wave-error");
      if ((this.#waveVersions.get(signalId) ?? 0) === version) this.#dirtyWaves.delete(signalId);
      this.#publishCounters();
    }).catch((error: unknown) => {
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
  }
}

function renderOverlay(owner: HTMLElement, primitive: AnnotationOverlayPrimitive): void {
  owner.dataset.annotationType = primitive.type;
  owner.dataset.annotationShape = primitive.shape;
  owner.dataset.visible = String(primitive.visible);
  owner.dataset.lineType = primitive.lineType ?? "straight";
  owner.dataset.arrowhead = primitive.arrowhead ?? "none";
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

function syncShellLayer(layer: HTMLElement, cache: Map<string, HTMLElement>, rowIds: readonly string[], rows: ReadonlyMap<string, RowLayoutEntry>, surface: string): void {
  const active = new Set(rowIds);
  for (const [rowId, shell] of cache) if (!active.has(rowId)) shell.remove();
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
    }
    shell.dataset.kind = row.kind;
    shell.dataset.name = row.name;
    shell.dataset.groupId = row.groupId;
    shell.dataset.groupName = row.groupName;
    shell.dataset.groupStart = String(row.groupId !== previousGroupId);
    if (row.role) shell.dataset.signalRole = row.role; else delete shell.dataset.signalRole;
    if (!shell.hasAttribute("aria-selected")) shell.setAttribute("aria-selected", "false");
    if (surface === "left" && row.kind === "timing") {
      shell.draggable = true;
      shell.setAttribute("aria-grabbed", "false");
    }
    populateShell(shell, row, surface, row.groupId !== previousGroupId);
    place(shell, row);
    ordered.push(shell);
    previousGroupId = row.groupId;
  }
  layer.replaceChildren(...ordered);
}

function populateShell(shell: HTMLElement, row: RowLayoutEntry, surface: string, groupStart: boolean): void {
  if (surface === "timing") return;
  const document = shell.ownerDocument;
  if (surface === "left") {
    const branch = document.createElement("span");
    branch.dataset.role = "tree-branch";
    branch.dataset.groupId = row.groupId;
    branch.draggable = groupStart;
    if (groupStart) branch.setAttribute("aria-label", `Move group ${row.groupName}`);
    branch.textContent = groupStart ? row.groupName : "";
    const name = document.createElement("span");
    name.dataset.role = "tree-signal-name";
    name.textContent = row.name;
    shell.replaceChildren(branch, name);
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

function place(element: HTMLElement, row: RowLayoutEntry): void {
  element.style.transform = `translateY(${row.y}px)`;
  element.style.height = `${row.height}px`;
}

function assertCrossSurfaceInvariant(projection: RenderProjection): void {
  const expected = projection.visibleRowIds.join("\u0000");
  if (projection.leftRowIds.join("\u0000") !== expected || projection.frozenLabelRowIds.join("\u0000") !== expected || projection.timingRowIds.join("\u0000") !== expected) {
    throw new Error("Cross-surface row ID invariant failed.");
  }
}
