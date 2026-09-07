import { useEffect } from "react";
import type { TimelineSurfaceRuntimeInput } from "./timeline-surface-controller.js";
import { buildViewportWindow } from "./viewport-window.js";
import { createWaveformSurfaceProvider } from "./waveform-surface-provider.js";
import { mountInitialTimelineProjection } from "./viewport-projection.js";
export function useSignalSplitSurfaceRuntime(input: TimelineSurfaceRuntimeInput): void {
  const { application, dom, presentation } = input;
  const { viewportLower, hostLower, signalSplitRuntimeRef } = dom;
  const { collapsedGroupIdsRef, forceUpperReprojectRef, lowerCanvasClickRef, timelineRuntimeRef, refreshPlayhead, refreshRangeSelectionBand } = presentation;
  const signalSplitEnabled = input.signalSplitEnabled;
  useEffect(() => {
    const runtime = application.runtime;
    if (!signalSplitEnabled) {
      signalSplitRuntimeRef.current?.dispose();
      signalSplitRuntimeRef.current = null;
      runtime.projection.setPane(undefined);
      forceUpperReprojectRef.current();
      return;
    }
    const hostLowerElement = hostLower.current;
    const viewportLowerElement = viewportLower.current;
    if (!hostLowerElement || !viewportLowerElement) return;
    let active = true;
    const { geometry: geometryRegistryLower, projection: projectionCoordinatorLower } = runtime.createSignalSplitLowerPane();
    const adapterLower = runtime.createWaveDromAdapter();
    const providerLower = createWaveformSurfaceProvider({
      sessionController: runtime.session,
      getDocumentEpoch: () => projectionCoordinatorLower.currentDocumentEpoch(),
      mappingCache: runtime.displayMapping,
      adapter: adapterLower,
      geometryRegistry: geometryRegistryLower,
      // Lower doesn't own open/first-paint instrumentation (Upper's single
      // mount effect already reports that for the document as a whole) and
      // doesn't do its own snap-index lookups (snap is Upper-owned, per the
      // single-authority constraint above), so both are no-ops here.
      markOpenPhase: () => undefined,
      invalidateSnapIndex: () => undefined,
    });
    const renderCoordinatorLower = runtime.createRenderer(providerLower);
    const rendererLower = renderCoordinatorLower.renderer;
    const initialSnapshot = runtime.session.snapshot();
    const initialLower = mountInitialTimelineProjection({
      coordinator: renderCoordinatorLower,
      renderer: rendererLower,
      host: hostLowerElement,
      viewport: viewportLowerElement,
      referenceClock: initialSnapshot.document.timeline.referenceClock,
      projectionCoordinator: projectionCoordinatorLower,
      snapshot: initialSnapshot,
      collapsedGroupIds: [...collapsedGroupIdsRef.current],
    });
    let lowerWindow = initialLower.window;
    let lowerProjection = initialLower.projection;
    // Lower's own vertical scroll must re-virtualize its rows exactly like
    // Upper's viewport does (via timelineRuntime.onViewportScroll() in the
    // primary mount effect) -- without this, Lower would only ever mount
    // whatever rows happened to fall in its initial mount-time window,
    // never responding to the user scrolling it. This is Lower-local
    // (Y-axis row mounting), not the shared horizontal/pixels-per-cycle
    // authority, so it doesn't conflict with the single-owner constraint.
    const reprojectLowerViewportOnly = () => {
      if (!active) return;
      lowerWindow = buildViewportWindow(viewportLowerElement, runtime.session.snapshot().document.timeline.referenceClock);
      lowerProjection = projectionCoordinatorLower.project({ snapshot: runtime.session.snapshot(), changeSet: {}, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      rendererLower.update(lowerProjection);
    };
    viewportLowerElement.addEventListener("scroll", reprojectLowerViewportOnly, { passive: true });
    // Lower-local row interaction PR1 (#200): a plain click anywhere on
    // Lower's own waveform canvas selects that cycle, via the shared
    // logic the primary mount effect exposes through lowerCanvasClickRef
    // (see its declaration above for why a ref bridge is needed between
    // these two independent effects).
    const onLowerCanvasClick = (event: MouseEvent) => { lowerCanvasClickRef.current(event, hostLowerElement, viewportLowerElement); };
    hostLowerElement.addEventListener("click", onLowerCanvasClick);
    signalSplitRuntimeRef.current = {
      onDocumentChanged: (result) => {
        if (!active) return;
        lowerWindow = buildViewportWindow(viewportLowerElement, result.snapshot.document.timeline.referenceClock);
        lowerProjection = projectionCoordinatorLower.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
        rendererLower.update(lowerProjection);
      },
      // The splitter (signalSplitRatio) resizes Lower's viewport via CSS
      // height alone -- unlike a real scroll, that never fires a "scroll"
      // event on its own, so Lower would keep mounting rows sized for its
      // pre-resize viewport until the user happened to scroll it. Re-run
      // the same viewport-only reproject explicitly whenever the ratio
      // changes (wired below).
      onViewportResize: reprojectLowerViewportOnly,
      onDocumentReplaced: () => {
        if (!active || !viewportLowerElement.isConnected) return;
        geometryRegistryLower.clear();
        viewportLowerElement.scrollLeft = 0;
        viewportLowerElement.scrollTop = 0;
        const replacedSnapshot = runtime.session.snapshot();
        lowerWindow = buildViewportWindow(viewportLowerElement, replacedSnapshot.document.timeline.referenceClock);
        lowerProjection = projectionCoordinatorLower.project({ snapshot: replacedSnapshot, changeSet: { fullDocumentReplace: true }, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
        rendererLower.update(lowerProjection);
      },
      getTotalHeight: () => lowerProjection.totalHeight,
      dispose: () => { renderCoordinatorLower.dispose(); },
    };
    // Upper must now show only its own pane's Signals too -- switch the
    // shared Upper projection's filter and force it to redraw immediately,
    // using the document as it stands right now (view-only: no command, no
    // history/dirty/canonical delta).
    runtime.projection.setPane("upper");
    forceUpperReprojectRef.current();
    // Paint Lower's initial grid/playhead/range presentation immediately --
    // otherwise it would stay blank until the next unrelated grid/playhead/
    // range-triggering event happened to fire.
    timelineRuntimeRef.current?.refreshGrid();
    refreshPlayhead.current();
    refreshRangeSelectionBand.current();
    return () => {
      active = false;
      viewportLowerElement.removeEventListener("scroll", reprojectLowerViewportOnly);
      hostLowerElement.removeEventListener("click", onLowerCanvasClick);
      renderCoordinatorLower.dispose();
      if (signalSplitRuntimeRef.current) signalSplitRuntimeRef.current = null;
    };
  }, [signalSplitEnabled]);

}
