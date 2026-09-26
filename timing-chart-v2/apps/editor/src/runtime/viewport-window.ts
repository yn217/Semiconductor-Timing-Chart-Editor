import type { SignalId } from "@timing-chart-v2/schema";
import type { VirtualizationWindow } from "@timing-chart-v2/projection";

/** Build the screen-space virtualization window from the scroll container. */
export function buildViewportWindow(viewport: Pick<HTMLElement, "scrollTop" | "clientHeight">, referenceClock?: SignalId, stickyRowIds: readonly SignalId[] = []): VirtualizationWindow {
  const bodyTop = Math.max(0, viewport.scrollTop - 34);
  return {
    viewportStartY: bodyTop,
    viewportEndY: bodyTop + viewport.clientHeight,
    overscanBefore: 48,
    overscanAfter: 48,
    pinnedRowIds: [...new Set([...(referenceClock ? [referenceClock] : []), ...stickyRowIds])],
    stickyRowIds,
  };
}
