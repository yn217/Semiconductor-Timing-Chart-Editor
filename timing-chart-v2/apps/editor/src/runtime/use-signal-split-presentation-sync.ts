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
      if (upperRulerContent && lowerRulerContent) lowerRulerContent.style.transform = upperRulerContent.style.transform;
      if (host.current && hostLower.current) {
        hostLower.current.style.width = host.current.style.width;
        const scale = host.current.style.getPropertyValue("--presentation-x-scale");
        if (scale) {
          hostLower.current.style.setProperty("--presentation-x-scale", scale);
          viewportLower.current?.style.setProperty("--presentation-x-scale", scale);
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
      if (lowerViewport.scrollLeft !== upperViewport.scrollLeft) lowerViewport.scrollLeft = upperViewport.scrollLeft;
      mirrorPresentation();
    };
    const onLowerScroll = () => {
      if (lowerViewport.scrollLeft !== upperViewport.scrollLeft) lowerViewport.scrollLeft = upperViewport.scrollLeft;
      mirrorPresentation();
    };
    upperViewport.addEventListener("scroll", onUpperScroll);
    lowerViewport.addEventListener("scroll", onLowerScroll);
    mirrorPresentation();
    return () => {
      upperViewport.removeEventListener("scroll", onUpperScroll);
      lowerViewport.removeEventListener("scroll", onLowerScroll);
    };
  }, [signalSplitEnabled, zoom]);

}
