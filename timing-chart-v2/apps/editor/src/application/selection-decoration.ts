import type { SignalId } from "@timing-chart-v2/schema";
import type { SelectionState } from "./use-selection-owner.js";

/** Apply semantic selection to mounted presentation nodes by stable ID. */
export function applySelectionDecorationToHost(rendererHost: HTMLElement, next: SelectionState, previous?: SelectionState): void {
  if (next.signalId) rendererHost.dataset.selectedSignalId = next.signalId;
  else delete rendererHost.dataset.selectedSignalId;
  const affectedSignalIds = new Set<string>([
    ...(previous?.signalIds ?? []), ...(next.signalIds ?? []),
    ...(previous?.spacerId ? [previous.spacerId] : []), ...(next.spacerId ? [next.spacerId] : []),
  ]);
  // Visit mounted rows once; a remounted row is found from the unchanged stable-ID selection.
  if (affectedSignalIds.size > 0) for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]")) {
    const id = row.dataset.rowId ?? row.dataset.signalId;
    if (id === undefined || !affectedSignalIds.has(id)) continue;
    const isSelected = next.signalIds.has(id as SignalId) || id === next.spacerId;
    row.dataset.selected = String(isSelected);
    row.setAttribute("aria-selected", String(isSelected));
  }
  const affectedAnnotationIds = new Set([...(previous?.annotationIds ?? []), ...next.annotationIds]);
  if (affectedAnnotationIds.size > 0) for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-annotation-id]")) {
    const id = owner.dataset.annotationId as unknown as (typeof next.annotationIds extends ReadonlySet<infer T> ? T : never);
    if (affectedAnnotationIds.has(id)) owner.dataset.selected = String(next.annotationIds.has(id));
  }
  const affectedGroupIds = new Set([previous?.groupId, next.groupId].filter(Boolean));
  for (const id of affectedGroupIds) for (const treeItem of rendererHost.querySelectorAll<HTMLElement>(`[role="treeitem"][data-row-id="${CSS.escape(String(id))}:header"]`)) treeItem.setAttribute("aria-selected", String(id === next.groupId));
  const legend = rendererHost.querySelector<HTMLElement>("[data-testid='editor-legend']");
  if (legend) {
    legend.dataset.selected = String(next.legendSelected);
    legend.setAttribute("aria-label", next.legendSelected ? "Legend, selected" : "Legend");
  }
}
