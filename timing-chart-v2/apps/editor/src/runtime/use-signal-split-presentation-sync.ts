import { timelineScrollOwner } from "./timeline-scroll-owner.js";
import { publishWaveLabelScale } from "./timeline-presentation-refresh.js";
import { useEffect } from "react";
import type { TimelineSurfaceRuntimeInput } from "./timeline-surface-controller.js";
export function useSignalSplitPresentationSync(input: TimelineSurfaceRuntimeInput): void {
  const { viewport, viewportLower, ruler, rulerLower, host, hostLower } = input.dom;
  const signalSplitEnabled = input.signalSplitEnabled;
  const zoom = input.navigation.zoom;
  useEffect(() => {
    if (!signalSplitEnabled) return;
    const upperViewport = viewport.current;
    const lowerViewport = viewportLower.current;
    if (!upperViewport || !lowerViewport) return;
    const mirrorPresentation = () => {
      const upperRulerContent = ruler.current;
      const lowerRulerContent = rulerLower.current;
      if (upperRulerContent && lowerRulerContent) { lowerRulerContent.style.transform = upperRulerContent.style.transform; lowerRulerContent.style.translate = upperRulerContent.style.translate; lowerRulerContent.style.transformOrigin = upperRulerContent.style.transformOrigin; } // #937: scale, origin AND scroll shift
      // #625: Lower has the same Timeline scroll extent as Upper (Cycle: each pane's TimelineViewport owns its own horizontal scroll).
      const upperOwner = timelineScrollOwner(upperViewport);
      const lowerOwner = timelineScrollOwner(lowerViewport);
      if (lowerOwner !== lowerViewport && upperOwner !== upperViewport) lowerOwner.style.setProperty("--timeline-min-width", `${upperOwner.scrollWidth}px`);
      // #937: the Lower Grid/Range band sit outside Lower's TimelineViewport, so they follow the shared horizontal scroll through the same
      // `--timeline-scroll-left` (+ grid clip window) Upper's syncRulerScroll publishes to its own consumers.
      if (upperOwner !== upperViewport && zoom > 0) {
        for (const consumer of lowerViewport.querySelectorAll<HTMLElement>("[data-testid='geometry-grid-lower'], [data-testid='range-selection-band-lower']")) {
          consumer.style.setProperty("--timeline-scroll-left", String(upperOwner.scrollLeft));
          if (consumer.dataset.testid === "geometry-grid-lower") { consumer.style.setProperty("--grid-clip-left", `${upperOwner.scrollLeft / zoom}px`); consumer.style.setProperty("--grid-clip-right", `${(upperOwner.scrollLeft + upperOwner.clientWidth) / zoom}px`); }
        }
      }
      if (host.current && hostLower.current) {
        hostLower.current.style.width = host.current.style.width;
        const scale = host.current.style.getPropertyValue("--presentation-x-scale");
        if (scale) {
          hostLower.current.style.setProperty("--presentation-x-scale", scale);
          publishWaveLabelScale(hostLower.current, Number(scale));
        }
      }
    };
    // Upper is the sole horizontal-scroll authority (per #200's single
    // pixels-per-cycle/horizontal-geometry-owner constraint): Upper's own
    // scroll always drives Lower's scrollLeft to match. Lower's own "scroll"
    // event only re-syncs presentation (ruler/scale/width) and must NEVER
    // write back to Upper -- Lower's real WaveDrom content mounts
    // asynchronously as rows render, and a resulting incidental reflow can
    // fire a native "scroll" event on Lower even with no user interaction;
    // writing that back to Upper would silently clobber the user's actual
    // scroll position with Lower's still-settling one.
    const onUpperScroll = () => {
      const upperOwner = timelineScrollOwner(upperViewport);
      const lowerOwner = timelineScrollOwner(lowerViewport);
      if (lowerOwner.scrollLeft !== upperOwner.scrollLeft) lowerOwner.scrollLeft = upperOwner.scrollLeft;
      mirrorPresentation();
    };
    const onLowerScroll = () => {
      const upperOwner = timelineScrollOwner(upperViewport);
      const lowerOwner = timelineScrollOwner(lowerViewport);
      if (lowerOwner.scrollLeft !== upperOwner.scrollLeft) lowerOwner.scrollLeft = upperOwner.scrollLeft;
      mirrorPresentation();
    };
    upperViewport.addEventListener("scroll", onUpperScroll, true);
    lowerViewport.addEventListener("scroll", onLowerScroll, true);
    mirrorPresentation();
    // Zoom is applied to Upper's ruler on the next frame(s); mirror again once it has landed (otherwise Lower keeps the previous zoom).
    const settle = requestAnimationFrame(() => requestAnimationFrame(mirrorPresentation));
    return () => {
      cancelAnimationFrame(settle);
      upperViewport.removeEventListener("scroll", onUpperScroll, true);
      lowerViewport.removeEventListener("scroll", onLowerScroll, true);
    };
  }, [signalSplitEnabled, zoom]);

}
