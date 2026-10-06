import type { RenderProjection, RowLayoutEntry } from "@timing-chart-v2/projection";
import type { WaveSignalId } from "./types.js";

/** Reconcile only the viewport's Wave owners; canonical/semantic invalidation stays with StableTimingChartRenderer.update(). */
export function reconcileViewportWaveOwners(input: {
  readonly layer: HTMLElement;
  readonly projection: RenderProjection;
  readonly rows: ReadonlyMap<string, RowLayoutEntry>;
  readonly firstTimingRowByGroup: ReadonlyMap<string, string>;
  readonly owners: Map<WaveSignalId, HTMLElement>;
  readonly connectedSignalIds: Set<WaveSignalId>;
  readonly recentSignalIds: WaveSignalId[];
  readonly dirtyWaves: ReadonlySet<WaveSignalId>;
  readonly sourceWindow: Readonly<{ start: number; end: number }> | undefined;
  readonly queueWave: (signalId: WaveSignalId, owner: HTMLElement) => void;
  readonly initializeOwner: (owner: HTMLElement, row: RowLayoutEntry) => void;
}): Readonly<{ created: number; cacheHits: number }> {
  const mounted = new Set(input.projection.mountedSignalIds);
  const retainedLimit = Math.min(24, Math.max(8, mounted.size));
  const historyLimit = mounted.size + retainedLimit;
  if (input.recentSignalIds.length > historyLimit) input.recentSignalIds.splice(0, input.recentSignalIds.length - historyLimit);
  const visibleRows = visibleRowIdSet(input.projection.visibleRowIds);
  const retainedIds = input.recentSignalIds
    .filter((signalId) => !mounted.has(signalId) && visibleRows.has(signalId) && input.owners.has(signalId))
    .slice(-retainedLimit);
  const retained = new Set(retainedIds);
  const connected = new Set([...mounted, ...retained]);
  for (const signalId of input.connectedSignalIds) {
    if (connected.has(signalId)) continue;
    input.owners.get(signalId)?.remove();
    input.connectedSignalIds.delete(signalId);
  }
  let created = 0;
  let cacheHits = 0;
  for (const signalId of [...retainedIds, ...input.projection.mountedSignalIds]) {
    const row = input.rows.get(signalId);
    if (!row || row.kind !== "timing" || !row.visible) throw new Error(`Missing visible RowLayout for Wave Signal '${signalId}'.`);
    let owner = input.owners.get(signalId);
    const isNew = owner === undefined;
    if (!owner) {
      owner = input.layer.ownerDocument.createElement("div");
      owner.dataset.role = "wave-owner";
      owner.dataset.signalId = signalId;
      owner.style.position = "absolute";
      input.owners.set(signalId, owner);
      created += 1;
    }
    if (!owner.isConnected) {
      if (!isNew) cacheHits += 1;
      input.layer.append(owner);
    }
    input.connectedSignalIds.add(signalId);
    if (mounted.has(signalId)) {
      delete owner.dataset.viewportRetained;
      if (!isNew) { input.owners.delete(signalId); input.owners.set(signalId, owner); }
      const recentIndex = input.recentSignalIds.indexOf(signalId);
      if (recentIndex >= 0) input.recentSignalIds.splice(recentIndex, 1);
      input.recentSignalIds.push(signalId);
    } else {
      if (owner.dataset.viewportRetained !== "true") owner.dataset.viewportRetained = "true";
    }
    if (owner.dataset.groupId !== row.groupId) owner.dataset.groupId = row.groupId;
    const groupStart = String(input.firstTimingRowByGroup.get(row.groupId) === row.rowId);
    if (owner.dataset.groupStart !== groupStart) owner.dataset.groupStart = groupStart;
    const pinnedRow = String(row.pinned === true);
    if (owner.dataset.pinnedRow !== pinnedRow) owner.dataset.pinnedRow = pinnedRow;
    const transform = `translateY(${row.y}px)`;
    const height = `${row.height}px`;
    if (owner.style.transform !== transform) owner.style.transform = transform;
    if (owner.style.height !== height) owner.style.height = height;
    if (isNew) input.initializeOwner(owner, row);
    const sourceWindow = input.sourceWindow;
    const sourceWindowChanged = sourceWindow !== undefined
      && (owner.dataset.renderedSourceWindowStart !== String(sourceWindow.start)
        || owner.dataset.renderedSourceWindowEnd !== String(sourceWindow.end));
    if (mounted.has(signalId) && (isNew || input.dirtyWaves.has(signalId) || sourceWindowChanged)) input.queueWave(signalId, owner);
  }
  if (input.recentSignalIds.length > historyLimit) input.recentSignalIds.splice(0, input.recentSignalIds.length - historyLimit);
  return { created, cacheHits };
}

const visibleRowIdsBySource = new WeakMap<readonly string[], ReadonlySet<string>>();

function visibleRowIdSet(source: readonly string[]): ReadonlySet<string> {
  let ids = visibleRowIdsBySource.get(source);
  if (!ids) {
    ids = new Set(source);
    visibleRowIdsBySource.set(source, ids);
  }
  return ids;
}
