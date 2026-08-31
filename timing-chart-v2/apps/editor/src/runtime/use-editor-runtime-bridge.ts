import type { RefObject } from "react";
import { EditorApplicationRuntime } from "./editor-application-runtime.js";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { projectAnnotationOverlays } from "./annotation-overlays.js";
import { projectEdgeCounters } from "./edge-counter-projection.js";
import { resolveTimeAxisGeometry } from "@timing-chart-v2/geometry";
import { renderGeometryGrid } from "../render-geometry-grid.js";
import { buildRuler } from "./build-ruler.js";
import { referenceSvgScreenScale } from "./screen-scale.js";

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

export function scheduleDialogFocusRestore(doc: Document, originRef: { current: HTMLElement | null }, labelRef: { current: string | null }): () => void {
  const frame = requestAnimationFrame(() => { const label = labelRef.current; const origin = originRef.current?.isConnected ? originRef.current : label === null ? null : label === "Properties" ? [...doc.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === label) ?? null : doc.querySelector<HTMLElement>(`button[aria-label='${label}']`); originRef.current = null; labelRef.current = null; if (origin?.isConnected) origin.focus({ preventScroll: true }); });
  return () => cancelAnimationFrame(frame);
}

export function trapDialogTab(doc: Document, event: KeyboardEvent): boolean {
  const activeDialog = doc.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
  if (!activeDialog || event.key !== "Tab") return false;
  const focusable = [...activeDialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")].filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) return true;
  const first = focusable[0]!; const last = focusable.at(-1)!;
  if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
  else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
  return true;
}

export function refreshRendererOverlays(renderer: any, host: RefObject<HTMLDivElement | null>, document: CanonicalDocument, projection: any, geometryMaps: any, mappingCache: any, screenGeometryScale: number, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined): void { renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps, mappingCache.get(document.timeline, document.timeGroups), screenGeometryScale)); renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, range, selectedCycle, screenGeometryScale)); for (const owner of host.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationId); }

export function refreshGridPresentation(grid: HTMLElement, document: CanonicalDocument, geometryMaps: any, mappingCache: any, enabled: boolean, totalHeight: number, viewportWidth: number, screenGeometryScale: number): void { const timeAxis = resolveTimeAxisGeometry(document, geometryMaps); renderGeometryGrid(grid, timeAxis.geometry, timeAxis.ownerSignalId, enabled, totalHeight, mappingCache.get(document.timeline, document.timeGroups), Math.max(160, viewportWidth), screenGeometryScale, timeAxis.mode); }

export function rebuildRulerPresentation(ruler: HTMLElement, document: CanonicalDocument, geometryMaps: any, mappingCache: any, fitWidth: number, previousScale: number | undefined, referenceSvg: SVGSVGElement | undefined, zoom: number): { readonly timeAxis: any; readonly scale: number } { const timeAxis = resolveTimeAxisGeometry(document, geometryMaps); const scale = buildRuler(ruler, timeAxis.geometry, document, timeAxis.ownerSignalId, mappingCache.get(document.timeline, document.timeGroups), fitWidth, previousScale, referenceSvgScreenScale(referenceSvg), timeAxis.mode); return { timeAxis, scale }; }

export function attachMenuKeyboardNavigation(doc: Document, closeContextMenu: () => void, closeTreeAddMenu: () => void, closeTreeMoreMenu: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : undefined; const activeMenu = target?.closest<HTMLElement>("[role='menu']"); if (!activeMenu) return; if (event.key === "Escape") { event.preventDefault(); if (activeMenu.classList.contains("context-menu")) closeContextMenu(); else if (activeMenu.classList.contains("tree-add-menu")) closeTreeAddMenu(); else closeTreeMoreMenu(); return; } if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; const items = [...activeMenu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; if (items.length === 0) return; event.preventDefault(); const current = items.indexOf(doc.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next]?.focus(); };
  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}
