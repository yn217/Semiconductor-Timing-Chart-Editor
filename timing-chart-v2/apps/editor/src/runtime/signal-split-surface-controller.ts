import type { TimelineSurfaceRuntimeInput } from "./timeline-surface-controller.js";
import { buildViewportWindow } from "./viewport-window.js";
import { createWaveformSurfaceProvider } from "./waveform-surface-provider.js";
import { mountInitialTimelineProjection } from "./viewport-projection.js";

export interface SignalSplitSurfaceController {
  readonly mount: () => (() => void) | undefined;
}

/** Owns the Lower signal-split renderer lifecycle outside React composition. */
export function createSignalSplitSurfaceController(input: TimelineSurfaceRuntimeInput): SignalSplitSurfaceController {
  const { application, dom, presentation } = input;
  const { viewportLower, hostLower, signalSplitRuntimeRef } = dom;
  const { collapsedGroupIdsRef, forceUpperReprojectRef, lowerCanvasClickRef, timelineRuntimeRef, refreshPlayhead, refreshRangeSelectionBand } = presentation;
  const signalSplitEnabled = input.signalSplitEnabled;

  return {
    mount: () => {
      const runtime = application.runtime;
      if (!signalSplitEnabled) {
        signalSplitRuntimeRef.current?.dispose();
        signalSplitRuntimeRef.current = null;
        runtime.projection.setPane(undefined);
        forceUpperReprojectRef.current();
        return undefined;
      }
      const hostLowerElement = hostLower.current;
      const viewportLowerElement = viewportLower.current;
      if (!hostLowerElement || !viewportLowerElement) return undefined;
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
      // Upper's viewport does. This is Lower-local row mounting, not a second
      // horizontal/pixels-per-cycle geometry authority.
      const reprojectLowerViewportOnly = () => {
        if (!active) return;
        lowerWindow = buildViewportWindow(viewportLowerElement, runtime.session.snapshot().document.timeline.referenceClock);
        lowerProjection = projectionCoordinatorLower.project({ snapshot: runtime.session.snapshot(), changeSet: {}, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
        rendererLower.update(lowerProjection);
      };
      viewportLowerElement.addEventListener("scroll", reprojectLowerViewportOnly, { passive: true });
      // Lower-local row interaction uses the shared upper interaction owner.
      const onLowerCanvasClick = (event: MouseEvent) => { lowerCanvasClickRef.current(event, hostLowerElement, viewportLowerElement); };
      hostLowerElement.addEventListener("click", onLowerCanvasClick);
      signalSplitRuntimeRef.current = {
        onDocumentChanged: (result) => {
          if (!active) return;
          lowerWindow = buildViewportWindow(viewportLowerElement, result.snapshot.document.timeline.referenceClock);
          lowerProjection = projectionCoordinatorLower.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
          rendererLower.update(lowerProjection);
        },
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
      forceUpperReprojectRef.current();
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
    },
  };
}
