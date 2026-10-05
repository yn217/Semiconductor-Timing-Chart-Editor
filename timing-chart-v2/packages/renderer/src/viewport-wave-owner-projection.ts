import type { RenderProjection, RowLayoutEntry } from "@timing-chart-v2/projection";
import type { WaveSignalId } from "./types.js";

/** Reconcile only the viewport's Wave owners; canonical/semantic invalidation stays with StableTimingChartRenderer.update(). */
export function reconcileViewportWaveOwners(input: {
  readonly layer: HTMLElement;
  readonly projection: RenderProjection;
  readonly rows: ReadonlyMap<string, RowLayoutEntry>;
  readonly owners: Map<WaveSignalId, HTMLElement>;
  readonly dirtyWaves: ReadonlySet<WaveSignalId>;
  readonly sourceWindow: Readonly<{ start: number; end: number }> | undefined;
  readonly queueWave: (signalId: WaveSignalId, owner: HTMLElement) => void;
  readonly initializeOwner: (owner: HTMLElement, row: RowLayoutEntry) => void;
}): Readonly<{ created: number; cacheHits: number }> {
  const firstTimingRowByGroup = new Map<string, string>();
  for (const rowId of input.projection.timingRowIds) {
    const row = input.rows.get(rowId);
    if (row?.kind === "timing" && !firstTimingRowByGroup.has(row.groupId)) firstTimingRowByGroup.set(row.groupId, row.rowId);
  }
  const mounted = new Set(input.projection.mountedSignalIds);
  for (const [signalId, owner] of input.owners) if (!mounted.has(signalId)) owner.remove();
  let created = 0;
  let cacheHits = 0;
  for (const signalId of input.projection.mountedSignalIds) {
    const row = input.rows.get(signalId);
    if (!row) throw new Error(`Missing RowLayout for mounted Signal '${signalId}'.`);
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
    if (!isNew) { input.owners.delete(signalId); input.owners.set(signalId, owner); }
    owner.dataset.groupId = row.groupId;
    owner.dataset.groupStart = String(firstTimingRowByGroup.get(row.groupId) === row.rowId);
    owner.dataset.pinnedRow = String(row.pinned === true);
    const transform = `translateY(${row.y}px)`;
    const height = `${row.height}px`;
    if (owner.style.transform !== transform) owner.style.transform = transform;
    if (owner.style.height !== height) owner.style.height = height;
    if (isNew) input.initializeOwner(owner, row);
    const sourceWindow = input.sourceWindow;
    const sourceWindowChanged = sourceWindow !== undefined
      && (owner.dataset.renderedSourceWindowStart !== String(sourceWindow.start)
        || owner.dataset.renderedSourceWindowEnd !== String(sourceWindow.end));
    if (isNew || input.dirtyWaves.has(signalId) || sourceWindowChanged) input.queueWave(signalId, owner);
  }
  return { created, cacheHits };
}
