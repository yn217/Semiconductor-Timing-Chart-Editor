import { fixedColumnsOutsideTimeline } from "./timeline-scroll-owner.js";
import type { RefObject } from "react";

export type RendererHostSizingContext = {
  readonly host: RefObject<HTMLDivElement | null>;
  readonly viewport: RefObject<HTMLDivElement | null>;
  readonly metrics: { readonly viewportWidth: number; readonly leftPaneWidth: number; readonly inspectorWidth: number; readonly frozenPaneWidth: number; readonly zoom: number };
};

export function applyRendererHostSizing({ host, viewport, metrics }: RendererHostSizingContext): void {
  const rendererHost = host.current;
  const viewportElement = viewport.current;
  if (!rendererHost || !viewportElement) return;
  const availableWidth = metrics.viewportWidth > 0 ? metrics.viewportWidth : globalThis.innerWidth;
  const baseWidth = Math.max(160, availableWidth - metrics.leftPaneWidth - metrics.frozenPaneWidth);
  const width = metrics.leftPaneWidth + metrics.frozenPaneWidth + baseWidth * metrics.zoom;
  rendererHost.style.width = `${width}px`;
  const timingSurface = rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']");
  timingSurface?.style.setProperty("width", `${width}px`);
  timingSurface?.style.setProperty("grid-template-columns", `${metrics.leftPaneWidth}px ${metrics.frozenPaneWidth}px var(--wave-width, 640px)`);
  // #625: in Cycle the frozen column is a plain grid column (no sticky offset to publish).
  const frozen = rendererHost.querySelector<HTMLElement>("[data-role='frozen-label-rows']");
  if (fixedColumnsOutsideTimeline(viewportElement)) frozen?.style.removeProperty("left");
  else frozen?.style.setProperty("left", `${metrics.leftPaneWidth}px`, "important");
}
