import { timelineScrollOwner } from "./timeline-scroll-owner.js";

/** Owns the native listeners, resize observation and DOM geometry for the single visible Timeline scrollbar. */
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
    filler.style.width = `${Math.max(0, owner.scrollWidth - offset)}px`;
    bar.dataset.timelineLeft = String(Math.round(originLeft));
    bar.hidden = owner.scrollWidth <= owner.clientWidth;
    if (!syncing) bar.scrollLeft = owner.scrollLeft;
  };
  const onViewScroll = () => { if (syncing) return; syncing = true; bar.scrollLeft = timelineScrollOwner(view).scrollLeft; syncing = false; };
  const onBarScroll = () => { if (syncing) return; syncing = true; timelineScrollOwner(view).scrollLeft = bar.scrollLeft; syncing = false; };
  layout();
  view.addEventListener("scroll", onViewScroll, { passive: true, capture: true });
  bar.addEventListener("scroll", onBarScroll, { passive: true });
  const observer = new ResizeObserver(layout);
  observer.observe(view);
  if (view.firstElementChild) observer.observe(view.firstElementChild);
  const owner = timelineScrollOwner(view);
  if (owner !== view) { observer.observe(owner); for (const child of owner.children) observer.observe(child); }
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
