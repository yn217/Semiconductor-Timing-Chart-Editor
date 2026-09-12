import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { ImmutableSnapIndex, ScreenGeometryProjector, TimeAxisGeometry } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";

export type EditorEventBinding = {
  readonly target: EventTarget;
  readonly type: string;
  readonly listener: EventListener;
  readonly options?: boolean | AddEventListenerOptions;
};

export function attachEditorEventBindings(bindings: readonly EditorEventBinding[]): () => void {
  for (const binding of bindings) binding.target.addEventListener(binding.type, binding.listener, binding.options);
  return () => {
    for (const binding of [...bindings].reverse()) binding.target.removeEventListener(binding.type, binding.listener, binding.options);
  };
}

export function attachMenuKeyboardNavigation(doc: Document, closeContextMenu: () => void, closeTreeAddMenu: () => void, closeTreeMoreMenu: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : undefined; const activeMenu = target?.closest<HTMLElement>("[role='menu']"); if (!activeMenu) return; if (event.key === "Escape") { event.preventDefault(); if (activeMenu.classList.contains("context-menu")) closeContextMenu(); else if (activeMenu.classList.contains("tree-add-menu")) closeTreeAddMenu(); else closeTreeMoreMenu(); return; } if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; const items = [...activeMenu.querySelectorAll<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")]; if (items.length === 0) return; event.preventDefault(); const current = items.indexOf(doc.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next]?.focus(); };
  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}

export function resolveTransactionSnapCycle(context: {
  readonly clientX: number;
  readonly surfaceLeft: number | undefined;
  readonly host: HTMLElement;
  readonly projection: RenderProjection;
  readonly timeAxis: TimeAxisGeometry;
  readonly screenGeometry: ScreenGeometryProjector;
  readonly zoom: number;
  readonly snapEnabled: boolean;
  readonly document: CanonicalDocument;
  readonly currentSnapIndex: () => ImmutableSnapIndex;
  readonly cycleBoundaryAtPointerX: (clientX: number) => number | undefined;
  readonly cycleBoundaryAtX: (clientX: number) => number | undefined;
  readonly cycleBoundaryAtLocalX: (localX: number, zoom: number, snapEnabled: boolean) => number | undefined;
  readonly publishState: () => void;
}): number | undefined {
  if (!context.snapEnabled) {
    return context.surfaceLeft === undefined
      ? context.cycleBoundaryAtX(context.clientX)
      : context.cycleBoundaryAtLocalX(
        context.screenGeometry.fromScreen({ x: context.clientX - context.surfaceLeft, y: 0 }, { scrollX: 0, scrollY: 0, zoom: context.zoom }).x,
        context.zoom,
        false,
      );
  }
  const axisOwner = context.timeAxis.ownerSignalId;
  const axisRow = axisOwner === undefined ? undefined : context.projection.rowLayout.find((row) => row.rowId === axisOwner);
  if (context.surfaceLeft === undefined) return context.cycleBoundaryAtPointerX(context.clientX);
  if (!axisOwner || !axisRow) {
    return context.cycleBoundaryAtLocalX(
      context.screenGeometry.fromScreen({ x: context.clientX - context.surfaceLeft, y: 0 }, { scrollX: 0, scrollY: 0, zoom: context.zoom }).x,
      context.zoom,
      true,
    );
  }
  const localPointer = context.screenGeometry.fromScreen({ x: context.clientX - context.surfaceLeft, y: 0 }, { scrollX: 0, scrollY: 0, zoom: context.zoom });
  const snap = context.currentSnapIndex().nearest({ x: localPointer.x, y: axisRow.y + context.document.layout.rowHeight / 2 }, 14 / context.zoom, ["cycle-boundary", "clock-edge", "signal-transition", "bus-transition", "marker", "annotation"]);
  return snap?.anchor.cycle ?? context.cycleBoundaryAtLocalX(localPointer.x, context.zoom, true);
}
