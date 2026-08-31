import type { RefObject } from "react";
import { EditorApplicationRuntime } from "./editor-application-runtime.js";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

export type RendererHostSizingContext = { readonly host: RefObject<HTMLDivElement | null>; readonly viewport: RefObject<HTMLDivElement | null>; readonly metrics: { readonly viewportWidth: number; readonly leftPaneWidth: number; readonly inspectorWidth: number; readonly frozenPaneWidth: number; readonly zoom: number } };
export function applyRendererHostSizing({ host, viewport, metrics }: RendererHostSizingContext): void { const rendererHost = host.current; const viewportElement = viewport.current; if (!rendererHost || !viewportElement) return; const availableWidth = metrics.viewportWidth > 0 ? metrics.viewportWidth : globalThis.innerWidth; const baseWidth = Math.max(160, availableWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth); const width = metrics.leftPaneWidth + metrics.frozenPaneWidth + baseWidth * metrics.zoom; rendererHost.style.width = `${width}px`; const timingSurface = rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']"); timingSurface?.style.setProperty("width", `${width}px`); timingSurface?.style.setProperty("grid-template-columns", `${metrics.leftPaneWidth}px ${metrics.frozenPaneWidth}px var(--wave-width, 640px)`); rendererHost.querySelector<HTMLElement>("[data-role='frozen-label-rows']")?.style.setProperty("left", `${metrics.leftPaneWidth}px`, "important"); }

export function refreshRulerRangeSelection(ruler: RefObject<HTMLDivElement | null>, active: boolean, range: { readonly start: number; readonly end: number }): void {
  const rulerElement = ruler.current;
  if (!rulerElement) return;
  for (const tick of rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")) {
    if (!active) delete tick.dataset.rangeSelected;
    else { const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle); tick.dataset.rangeSelected = String(cycle >= range.start && cycle < range.end); }
  }
}

export function createEditorRuntimeBridge(initialDocument: Readonly<CanonicalDocument>): EditorApplicationRuntime {
  return new EditorApplicationRuntime(initialDocument);
}

export function refreshTransactionLinkedRows(host: RefObject<HTMLDivElement | null>, linkedSignalIds: ReadonlySet<string>): void {
  for (const row of host.current?.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]") ?? []) {
    const id = row.dataset.rowId ?? row.dataset.signalId;
    row.dataset.transactionLinked = String(id !== undefined && linkedSignalIds.has(id));
  }
}

export function attachDirtyUnloadGuard(dirty: boolean): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; };
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
}

export function attachDialogOriginCapture(doc: Document, originRef: { current: HTMLElement | null }, labelRef: { current: string | null }, menuOriginRef: { current: HTMLElement | null }): () => void {
  const capture = (event: MouseEvent) => { const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-testid='bulk-register-open'], [data-testid='hierarchy-open']") : null; if (!target) return; labelRef.current = target.dataset.testid === "bulk-register-open" ? "Add signal or group" : "More tree actions"; originRef.current = menuOriginRef.current ?? doc.querySelector<HTMLElement>(`button[aria-label='${labelRef.current}']`) ?? target; };
  doc.addEventListener("click", capture, true);
  return () => doc.removeEventListener("click", capture, true);
}
