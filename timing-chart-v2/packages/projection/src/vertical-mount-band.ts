import type { VirtualizationWindow } from "./types.js";

/** Stable, bounded vertical window for lightweight row-shell DOM. */
export interface VerticalMountBand {
  readonly startY: number;
  readonly endY: number;
  readonly viewportHeight: number;
}

export interface VerticalMountBandUpdate {
  readonly band: VerticalMountBand;
  readonly changed: boolean;
}

/**
 * Keep a three-viewport shell band fixed during ordinary scrolling. Recenter
 * only after the exact viewport enters the inner guard, after a large jump,
 * or when the viewport size/semantic layout changes.
 */
export function updateVerticalMountBand(
  previous: VerticalMountBand | undefined,
  viewport: Pick<VirtualizationWindow, "viewportStartY" | "viewportEndY">,
  forceRecenter = false,
): VerticalMountBandUpdate {
  const startY = Math.max(0, viewport.viewportStartY);
  const endY = Math.max(startY, viewport.viewportEndY);
  const viewportHeight = Math.max(1, endY - startY);
  const guard = viewportHeight * 0.35;
  const insideLeadingGuard = previous !== undefined
    && (previous.startY === 0 || startY >= previous.startY + guard);
  const insideTrailingGuard = previous !== undefined
    && endY <= previous.endY - guard;
  const reusable = previous !== undefined
    && !forceRecenter
    && previous.viewportHeight === viewportHeight
    && insideLeadingGuard
    && insideTrailingGuard;
  if (reusable) return { band: previous, changed: false };

  return {
    band: {
      startY: Math.max(0, startY - viewportHeight),
      endY: endY + viewportHeight,
      viewportHeight,
    },
    changed: true,
  };
}
