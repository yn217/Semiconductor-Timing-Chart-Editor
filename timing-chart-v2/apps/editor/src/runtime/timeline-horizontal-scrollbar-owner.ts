import { timelineScrollOwner } from "./timeline-scroll-owner.js";

/** The scrollable width: the native one, scaled by the zoom published below 100% (scaled layers keep their unscaled layout width). */
export function effectiveScrollWidth(owner: HTMLElement): number {
  const shrink = Number(owner.dataset.scrollShrink);
  return Number.isFinite(shrink) && shrink > 0 && shrink < 1 ? Math.round(owner.scrollWidth * shrink) : owner.scrollWidth;
}

/** Owns DOM measurement, scroll synchronization, listeners and observation for the Cycle timeline track. */
export function mountTimelineHorizontalScrollbar(view: HTMLDivElement, bar: HTMLDivElement, filler: HTMLDivElement): () => void {
  view.dataset.ownHscroll = "true";
  let syncing = false;
  const layout = () => {
    const panel = bar.parentElement;
    if (!panel) return;
    const viewRect = view.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const ruler = view.querySelector<HTMLElement>(".cycle-ruler");
    const originLeft = ruler && !ruler.hidden ? ruler.getBoundingClientRect().left : viewRect.left;
    const owner = timelineScrollOwner(view);
    const offset = owner === view ? Math.max(0, originLeft - viewRect.left) : 0;
    bar.style.left = `${(owner === view ? viewRect.left : owner.getBoundingClientRect().left) - panelRect.left + offset}px`;
    const bottomTrack = panel.parentElement?.querySelector<HTMLElement>(".bottom-resize-track");
    const cover = bottomTrack && owner !== view ? Math.max(0, viewRect.bottom - bottomTrack.getBoundingClientRect().top) : 0;
    view.style.setProperty("--cycle-fill", `${Math.max(0, view.clientHeight - 34)}px`);
    bar.style.top = `${viewRect.bottom - panelRect.top - 15 - cover}px`;
    bar.style.width = `${Math.max(0, owner.clientWidth - offset)}px`;
    const scrollExtent = effectiveScrollWidth(owner);
    filler.style.width = `${Math.max(0, scrollExtent - offset)}px`;
    bar.dataset.timelineLeft = String(Math.round(originLeft));
    bar.hidden = scrollExtent <= owner.clientWidth;
    if (!syncing) bar.scrollLeft = owner.scrollLeft;
  };
  const onViewScroll = () => {
    if (syncing) return;
    const owner = timelineScrollOwner(view);
    const maxLeft = Math.max(0, effectiveScrollWidth(owner) - owner.clientWidth);
    if (owner.scrollLeft > maxLeft) owner.scrollLeft = maxLeft;
    syncing = true; bar.scrollLeft = owner.scrollLeft; syncing = false;
  };
  const onBarScroll = () => { if (syncing) return; syncing = true; timelineScrollOwner(view).scrollLeft = bar.scrollLeft; syncing = false; };
  layout();
  view.addEventListener("scroll", onViewScroll, { passive: true, capture: true });
  bar.addEventListener("scroll", onBarScroll, { passive: true });
  const observer = new ResizeObserver(layout);
  observer.observe(view);
  if (view.firstElementChild) observer.observe(view.firstElementChild);
  const owner = timelineScrollOwner(view);
  if (owner !== view) { observer.observe(owner); for (const child of owner.children) observer.observe(child); }
  // The Bottom editor resizing (tab content, splitter) moves the bar's resting line without resizing the viewport.
  for (const element of bar.parentElement?.parentElement?.querySelectorAll(".bottom-resize-track, .bottom-editor") ?? []) observer.observe(element);
  window.addEventListener("resize", layout);
  view.addEventListener("timeline-viewport-resize", layout);
  return () => {
    view.removeEventListener("scroll", onViewScroll, true);
    bar.removeEventListener("scroll", onBarScroll);
    observer.disconnect();
    window.removeEventListener("resize", layout);
    view.removeEventListener("timeline-viewport-resize", layout);
    delete view.dataset.ownHscroll;
  };
}
