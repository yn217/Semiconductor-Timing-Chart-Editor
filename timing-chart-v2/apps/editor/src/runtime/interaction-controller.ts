import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { ImmutableSnapIndex, ScreenGeometryProjector } from "@timing-chart-v2/geometry";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

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
  const onKeyDown = (event: KeyboardEvent) => { if (event.defaultPrevented && event.key !== "Escape") return; const target = event.target instanceof HTMLElement ? event.target : undefined; const activeMenu = target?.closest<HTMLElement>("[role='menu']"); if (!activeMenu || activeMenu.classList.contains("home-overflow-menu")) return; if (event.key === "Escape") { event.preventDefault(); const menuId = activeMenu.id; const invoker = menuId ? doc.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menuId)}"]`) : undefined; if (activeMenu.classList.contains("context-menu")) closeContextMenu(); else if (activeMenu.classList.contains("tree-add-menu")) closeTreeAddMenu(); else closeTreeMoreMenu(); if (invoker) requestAnimationFrame(() => invoker.focus()); return; } if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; const items = [...activeMenu.querySelectorAll<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")]; if (items.length === 0) return; event.preventDefault(); const current = items.indexOf(doc.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next]?.focus(); };
  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}

export function resolveTransactionSnapCycle(context: {
  readonly clientX: number;
  readonly surfaceLeft: number | undefined;
  /** Current scroll offset in rendered CSS pixels for the shared time viewport. */
  readonly horizontalScroll: number;
  readonly snapAxisRowY: number | undefined;
  readonly timeAxisMetrics: Pick<TimeAxisMetrics, "timeAxis" | "zoom">;
  readonly screenGeometry: ScreenGeometryProjector;
  readonly snapEnabled: boolean;
  readonly document: CanonicalDocument;
  readonly currentSnapIndex: () => ImmutableSnapIndex;
  readonly cycleBoundaryAtPointerX: (clientX: number) => number | undefined;
  readonly cycleBoundaryAtX: (clientX: number) => number | undefined;
  readonly cycleBoundaryAtLocalX: (localX: number, snapEnabled: boolean) => number | undefined;
}): number | undefined {
  const { timeAxis, zoom } = context.timeAxisMetrics;
  if (!context.snapEnabled) {
    return context.surfaceLeft === undefined
      ? context.cycleBoundaryAtX(context.clientX)
      : context.cycleBoundaryAtLocalX(
        context.screenGeometry.fromScreen({ x: context.clientX - context.surfaceLeft, y: 0 }, { scrollX: context.horizontalScroll / zoom, scrollY: 0, zoom }).x,
        false,
      );
  }
  const axisOwner = timeAxis.ownerSignalId;
  if (context.surfaceLeft === undefined) return context.cycleBoundaryAtPointerX(context.clientX);
  if (!axisOwner || context.snapAxisRowY === undefined) {
    return context.cycleBoundaryAtLocalX(
      context.screenGeometry.fromScreen({ x: context.clientX - context.surfaceLeft, y: 0 }, { scrollX: context.horizontalScroll / zoom, scrollY: 0, zoom }).x,
      true,
    );
  }
  const localPointer = context.screenGeometry.fromScreen({ x: context.clientX - context.surfaceLeft, y: 0 }, { scrollX: context.horizontalScroll / zoom, scrollY: 0, zoom });
  const snap = context.currentSnapIndex().nearest({ x: localPointer.x, y: context.snapAxisRowY + context.document.layout.rowHeight / 2 }, 14 / zoom, ["cycle-boundary", "clock-edge", "signal-transition", "bus-transition", "marker", "annotation"]);
  return snap?.anchor.cycle ?? context.cycleBoundaryAtLocalX(localPointer.x, true);
}
