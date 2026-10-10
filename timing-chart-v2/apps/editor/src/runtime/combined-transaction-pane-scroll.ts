import { timelineScrollOwner } from "./timeline-scroll-owner.js";

/** The Transaction pane's clipped Track region (its fixed lane labels are outside it). */
export const COMBINED_TRACK_REGION = "[data-role='transaction-track-viewport']";

/**
 * Combined has two stacked panes under one time axis. The Signal pane's nested Timeline viewport is the only horizontal scroll owner;
 * the Transaction pane's Track region is a clipped scroller (left lane labels never move) that mirrors that owner, and a horizontal
 * gesture over the panes or a programmatic reveal inside the region is forwarded back to the owner. Returns the cleanup.
 */
export function mountCombinedTransactionPaneScroll(pane: HTMLElement): () => void {
  const viewport = pane.closest<HTMLElement>(".cycle-viewport");
  if (!viewport) return () => undefined;
  let applying = false;
  const owner = (): HTMLElement => timelineScrollOwner(viewport);
  const region = (): HTMLElement | null => pane.querySelector<HTMLElement>(COMBINED_TRACK_REGION);
  const mirror = () => {
    const source = owner(); const target = region();
    if (!target || source === viewport || target.scrollLeft === source.scrollLeft) return;
    applying = true; target.scrollLeft = source.scrollLeft; applying = false;
  };
  const onOwnerScroll = (event: Event) => { if (event.target === owner() && !applying) mirror(); };
  const onRegionScroll = (event: Event) => {
    const source = owner();
    if (applying || event.target !== region() || source === viewport || source.scrollLeft === (event.target as HTMLElement).scrollLeft) return;
    applying = true; source.scrollLeft = (event.target as HTMLElement).scrollLeft; applying = false;
  };
  const onWheel = (event: WheelEvent) => {
    const source = owner();
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    // The owner scrolls natively under the pointer; everywhere else in the panes (Transaction pane, gaps below the Signal rows) forward.
    if (source === viewport || horizontal === 0 || (event.target instanceof Node && source.contains(event.target))) return;
    event.preventDefault();
    source.scrollLeft += horizontal;
  };
  viewport.addEventListener("scroll", onOwnerScroll, { passive: true, capture: true });
  pane.addEventListener("scroll", onRegionScroll, { passive: true, capture: true });
  viewport.addEventListener("wheel", onWheel, { passive: false });
  // React mounts the pane content in the same commit. Sync once here; subsequent
  // horizontal changes are mirrored by the owner's scroll event, not DOM observation.
  mirror();
  return () => {
    viewport.removeEventListener("scroll", onOwnerScroll, true);
    pane.removeEventListener("scroll", onRegionScroll, true);
    viewport.removeEventListener("wheel", onWheel);
  };
}
