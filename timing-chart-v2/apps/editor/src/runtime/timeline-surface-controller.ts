import { startTransition } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { RenderProjection, VirtualizationWindow } from "@timing-chart-v2/projection";
import type { Annotation, AnnotationId, CanonicalDocument, DocumentProblem, GroupId, SemanticAnchor, SignalId, SpacerId, TransactionId } from "@timing-chart-v2/schema";
import { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { EditorApplicationOwner } from "../application/use-editor-application-owner.js";
import { useDocumentLifecycle } from "../application/use-document-lifecycle.js";
import type { SelectionOwner } from "../application/use-selection-owner.js";
import type { ClipboardActions } from "../application/clipboard-actions.js";
import type { TimelineNavigationOwner } from "./use-timeline-navigation-owner.js";
import type { SelectedClockEdge } from "./edge-counter-projection.js";
import { ViewMetricsOwner } from "./view-metrics.js";
import { buildViewportWindow } from "./viewport-window.js";
import { createEdgeCounterProjectionMetrics } from "./edge-counter-projection.js";
import { TimelineGeometryOwner } from "./timeline-geometry-owner.js";
import { deriveRenderInvalidation } from "./render-invalidation.js";
import { createTimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { resolveTransactionSnapCycle } from "./interaction-controller.js";
import { scheduleInitialTimelineRefresh } from "./document-lifecycle-controller.js";
import { refreshRendererForReason } from "./render-coordinator.js";
import { createWaveformSurfaceProvider } from "./waveform-surface-provider.js";
import { mountInitialTimelineProjection, projectViewportWindow } from "./viewport-projection.js";
import { refreshGridPresentation, refreshPlayheadPresentation, refreshRangeBandPresentation, refreshTimelinePresentation, syncFrozenColumnScroll, syncPresentationScale, syncRulerScroll } from "./timeline-presentation-refresh.js";
import { attachTimelineSurfaceInteractions, createTimelineCycleBoundaryResolver, createTimelineViewportKeyDownHandler, type TimelineSurfaceInteractionHandle } from "./timeline-surface-interactions.js";
import { collectWaveRenderErrors, createOpenPhaseTracker } from "./runtime-diagnostics.js";
import { publishRendererState } from "./runtime-diagnostics.js";
import { applyRendererHostSizing } from "./renderer-host-sizing.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { nextCommandId } from "../command-id.js";
import { nextEntityId } from "../entity-id.js";
import type { BottomPinnedSelection, TreeTypeFilter } from "../workspace/use-workspace-ui-state.js";
import type { ContextMenuState } from "../workspace/use-dialog-menu-state.js";
import { resetInspectorAccordionState } from "../inspector-accordion.js";

type Setter<T> = Dispatch<SetStateAction<T>>;
type TimelineRange = Readonly<{ start: number; end: number }>;
type SignalSplitRuntime = Readonly<{
  onDocumentChanged: (result: { readonly snapshot: Extract<CommandResult, { readonly ok: true }>["snapshot"]; readonly changeSet: Extract<CommandResult, { readonly ok: true }>["changeSet"] }) => void;
  onDocumentReplaced: () => void;
  onViewportResize: () => void;
  getTotalHeight: () => number;
  dispose: () => void;
}>;

export interface TimelineSurfaceDomRefs {
  readonly host: MutableRefObject<HTMLDivElement | null>;
  readonly viewport: MutableRefObject<HTMLDivElement | null>;
  readonly ruler: MutableRefObject<HTMLDivElement | null>;
  readonly gridLayer: MutableRefObject<HTMLDivElement | null>;
  readonly viewportLower: MutableRefObject<HTMLDivElement | null>;
  readonly rulerLower: MutableRefObject<HTMLDivElement | null>;
  readonly hostLower: MutableRefObject<HTMLDivElement | null>;
  readonly gridLayerLower: MutableRefObject<HTMLDivElement | null>;
  readonly signalSplitRuntimeRef: MutableRefObject<SignalSplitRuntime | null>;
}
export interface TimelineSurfacePresentationPort {
  readonly collapsedGroupIdsRef: MutableRefObject<ReadonlySet<GroupId>>;
  readonly applyCollapsedGroupsRef: MutableRefObject<(ids: ReadonlySet<GroupId>) => void>;
  readonly forceUpperReprojectRef: MutableRefObject<() => void>;
  readonly lowerCanvasClickRef: MutableRefObject<(event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => void>;
  readonly timelineRuntimeRef: MutableRefObject<TimelineViewportRuntime | null>;
  readonly armArrowPick: MutableRefObject<(annotationType: "arrow" | "dependency") => void>;
  readonly snapTransactionCycle: MutableRefObject<(clientX: number, surfaceLeft?: number) => number | undefined>;
  readonly transactionBoundaryX: MutableRefObject<(cycle: number) => number | undefined>;
  readonly refreshPlayhead: MutableRefObject<() => void>;
  readonly refreshRangeSelectionBand: MutableRefObject<() => void>;
  readonly publishStateRef: MutableRefObject<() => void>;
  readonly timelineRangeRef: MutableRefObject<TimelineRange>;
  readonly rangeSelectionActiveRef: MutableRefObject<boolean>;
  readonly selectedCycleRef: MutableRefObject<number>;
  readonly selectedEdgeRef: MutableRefObject<SelectedClockEdge | undefined>;
  readonly selectedAnnotationRef: MutableRefObject<AnnotationId | undefined>;
  readonly gridEnabledRef: MutableRefObject<boolean>;
  readonly snapEnabledRef: MutableRefObject<boolean>;
  readonly treeFocusRowIdRef: MutableRefObject<string | undefined>;
  readonly suppressCanvasClickRef: MutableRefObject<boolean>;
  readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
}

export interface TimelineSurfaceStatePort {
  readonly setRuntimeDiagnostics: Setter<readonly DocumentProblem[]>;
  readonly setProblem: (value: string) => void;
  readonly setTreePresentationRevision: Setter<number>;
  readonly setTransactionPresentationRevision: Setter<number>;
  readonly setRangePresentationRevision: Setter<number>;
  readonly setPlayheadPresentationRevision: Setter<number>;
  readonly setTimelineRange: Setter<TimelineRange>;
  readonly setRangeSelectionActive: Setter<boolean>;
  readonly setSelectedCycle: Setter<number>;
  readonly setBottomPinned: Setter<boolean>;
  readonly setPinnedBottomSelection: Setter<BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId> | undefined>;
  readonly setTreeFilter: Setter<string>;
  readonly setTreeTypeFilter: Setter<TreeTypeFilter>;
  readonly setTreeAddMenuOpen: Setter<boolean>;
  readonly setTreeMoreMenuOpen: Setter<boolean>;
  readonly setContextMenu: Setter<ContextMenuState | undefined>;
  readonly setArrowPickStatus: Setter<"idle" | "from" | "to">;
  readonly setRenameDialogOpen: Setter<boolean>;
  readonly setCollapsedGroups: (next: ReadonlySet<GroupId>) => void;
  readonly toggleCollapsedGroup: (id: GroupId) => void;
  readonly closeContextMenu: () => void;
}

export interface TimelineSurfaceRuntimeInput {
  readonly application: EditorApplicationOwner;
  readonly documentLifecycle: ReturnType<typeof useDocumentLifecycle>;
  readonly selection: SelectionOwner;
  readonly editActions: ClipboardActions;
  readonly navigation: TimelineNavigationOwner;
  readonly commandRegistry: MutableRefObject<UiCommandRegistry>;
  readonly executeBatch: EditorApplicationOwner["executeBatch"];
  readonly dom: TimelineSurfaceDomRefs;
  readonly presentation: TimelineSurfacePresentationPort;
  readonly state: TimelineSurfaceStatePort;
  readonly viewMetricsOwner: ViewMetricsOwner;
  readonly signalSplitEnabled: boolean;
  readonly signalSplitRatio: number;
}

export interface TimelineSurfaceRuntimeOutput {
  readonly refreshPlayhead: () => void;
  readonly refreshRangeSelection: () => void;
  readonly forceUpperReproject: () => void;
  readonly selectCycleFromLowerPane: (event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => void;
  readonly getTransactionSnapCycle: (clientX: number) => number | undefined;
  readonly getTransactionBoundaryX: (cycle: number) => number | undefined;
  readonly publishRendererState: () => void;
}

export interface TimelineSurfaceController {
  readonly mount: () => (() => void) | undefined;
}

export function createTimelineSurfaceController(input: TimelineSurfaceRuntimeInput): TimelineSurfaceController {
  const { application, documentLifecycle, selection, navigation: timelineNavigation, commandRegistry, executeBatch } = input;
  const { host, viewport, ruler, gridLayer, viewportLower, rulerLower, hostLower, gridLayerLower, signalSplitRuntimeRef } = input.dom;
  const { collapsedGroupIdsRef, applyCollapsedGroupsRef, forceUpperReprojectRef, lowerCanvasClickRef, timelineRuntimeRef, armArrowPick, snapTransactionCycle, transactionBoundaryX, refreshPlayhead, refreshRangeSelectionBand, publishStateRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef, selectedAnnotationRef, gridEnabledRef, snapEnabledRef, treeFocusRowIdRef, suppressCanvasClickRef, menuOriginRef } = input.presentation;
  const { setRuntimeDiagnostics, setProblem, setTreePresentationRevision, setTransactionPresentationRevision, setRangePresentationRevision, setPlayheadPresentationRevision, setTimelineRange, setRangeSelectionActive, setSelectedCycle, setBottomPinned, setPinnedBottomSelection, setTreeFilter, setTreeTypeFilter, setTreeAddMenuOpen, setTreeMoreMenuOpen, setContextMenu, setArrowPickStatus, setRenameDialogOpen, setCollapsedGroups, toggleCollapsedGroup, closeContextMenu } = input.state;
  const viewMetricsOwner = input.viewMetricsOwner;
  const signalSplitEnabled = input.signalSplitEnabled;
  const signalSplitRatio = input.signalSplitRatio;

  return {
    mount: () => {
    let active = true;
    const rendererHost = host.current;
    const viewportElement = viewport.current;
    const rulerElement = ruler.current;
    const rulerViewportElement = rulerElement?.parentElement;
    const gridElement = gridLayer.current;
    if (!rendererHost || !viewportElement || !rulerElement || !rulerViewportElement || !gridElement) return;

    const runtime = application.runtime;
    const sessionController = runtime.session;
    const documentEpoch = runtime.documentEpoch;
    const adapter = runtime.createWaveDromAdapter();
    const projectionCoordinator = runtime.projection;
    const mappingCache = runtime.displayMapping;
    const geometryRegistry = runtime.geometry;
    const geometrySvgs = geometryRegistry.svgs;
    const geometryMaps = geometryRegistry.maps;
    const openPhaseTracker = createOpenPhaseTracker(rendererHost);
    const markOpenPhase = openPhaseTracker.mark;
    const beginOpenMeasurement = openPhaseTracker.begin;
    let projection!: RenderProjection;
    let publishState: () => void = () => undefined;
    const timelineGeometry = new TimelineGeometryOwner({
      mappingCache,
      geometryMaps,
      getDocument: () => sessionController.snapshot().document,
      getProjection: () => projection,
      onSnapIndexBuilt: () => publishState(),
    });
    const provider = createWaveformSurfaceProvider({
      sessionController,
      getDocumentEpoch: () => projectionCoordinator.currentDocumentEpoch(),
      mappingCache,
      adapter,
      geometryRegistry,
      markOpenPhase,
      onReferenceGeometryReady: () => {
        if (active && !rulerInitialized) {
          timelineRuntimeRef.current?.refreshRuler();
          timelineRuntimeRef.current?.refreshGrid();
        }
      },
      invalidateSnapIndex: () => timelineGeometry.invalidateSnapIndex(),
    });
    const renderCoordinator = runtime.createRenderer(provider);
    const renderer = renderCoordinator.renderer;
    const initialProjection = mountInitialTimelineProjection({
      coordinator: renderCoordinator,
      renderer,
      host: rendererHost,
      viewport: viewportElement,
      referenceClock: sessionController.snapshot().document.timeline.referenceClock,
      projectionCoordinator,
      snapshot: sessionController.snapshot(),
      collapsedGroupIds: [...collapsedGroupIdsRef.current],
    });
    let window: VirtualizationWindow = initialProjection.window;
    projection = initialProjection.projection;
    // Signal Split View (#200): lets the signalSplitEnabled effect force
    // Upper to reproject/re-render immediately after flipping
    // `projectionCoordinator.setPane()`, using the CURRENT document (not a
    // change -- Split toggling itself is view-only, so this must never
    // touch history/dirty/canonical state).
    forceUpperReprojectRef.current = () => {
      if (!active) return;
      // An empty changeSet is correct here, not `fullDocumentReplace` --
      // `projectionCoordinator.setPane()` already nulled the cached layout,
      // so the very next `project()` call rebuilds regardless of changeSet
      // flags. Declaring a fake full-document-replace would incorrectly
      // advance documentEpoch and clear annotation preview state for a
      // toggle that must be canonical/history/dirty-neutral.
      projection = projectionCoordinator.project({ snapshot: sessionController.snapshot(), changeSet: {}, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      renderer.update(projection);
    };
    let rulerBuilds = 0;
    let edgeCounterResolvePasses = 0;
    const edgeCounterMetrics = createEdgeCounterProjectionMetrics();
    let rulerInitialized = false;
    refreshPlayhead.current = () => {
      const boundaryToLocalX = (cycle: number) => timelineRuntime.sourceBoundaryToLocalX(sessionController.snapshot().document, cycle);
      refreshPlayheadPresentation(rulerElement, selectedCycleRef.current, boundaryToLocalX);
      // Signal Split View (#200): the playhead is a pure x-position marker
      // inside the ruler (ruler height is fixed regardless of pane row
      // count), so it mirrors safely onto Lower's own ruler using the same
      // one authoritative horizontal mapping -- no second playhead owner.
      if (rulerLower.current) refreshPlayheadPresentation(rulerLower.current, selectedCycleRef.current, boundaryToLocalX);
    };
    const refreshRangeSelectionBandNow = () => {
      refreshRangeBandPresentation(viewportElement, rulerElement, rendererHost, rangeSelectionActiveRef.current, rendererHost.dataset.rangePreview, timelineRangeRef.current, (cycle) => timelineRuntime.sourceBoundaryToLocalX(sessionController.snapshot().document, cycle), timelineNavigation.getZoom(), timelineOffset(), projection.totalHeight);
      // Signal Split View (#200): the range band's horizontal extent comes
      // from the one shared time mapping, but its vertical extent must span
      // Lower's OWN row content, not Upper's -- reusing Upper's totalHeight
      // here would stretch/shrink the band to the wrong pane's height.
      if (viewportLower.current && rulerLower.current && signalSplitRuntimeRef.current) refreshRangeBandPresentation(viewportLower.current, rulerLower.current, rendererHost, rangeSelectionActiveRef.current, rendererHost.dataset.rangePreview, timelineRangeRef.current, (cycle) => timelineRuntime.sourceBoundaryToLocalX(sessionController.snapshot().document, cycle), timelineNavigation.getZoom(), timelineOffset(), signalSplitRuntimeRef.current.getTotalHeight());
    };
    refreshRangeSelectionBand.current = refreshRangeSelectionBandNow;
    const refreshRangePreview = () => {
      timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end);
    };

    publishState = () => publishRendererState(rendererHost, sessionController.current(), viewMetricsOwner, adapter, geometryRegistry, projectionCoordinator, renderer, mappingCache, timelineGeometry.snapService, timelineGeometry.snapIndex, rulerBuilds, edgeCounterResolvePasses, timelineNavigation.getZoom(), application.validatorInvocationsRef.current, edgeCounterMetrics);
    publishStateRef.current = () => publishState();
    let frame = 0;
    // Definite-assignment: assigned below before the viewport runtime's
    // returned closures can ever be invoked (matches this file's rangeInteractions/
    // treeDrag forward-declaration convention); no dummy body is reachable.
    let timelineRender!: (reason: string) => void;
    const timelineRuntime = createTimelineViewportRuntime({
      dom: { viewportRef: { current: viewportElement }, waveformRef: { current: rendererHost }, rulerRef: { current: rulerElement }, gridRef: { current: gridElement }, overlayRef: { current: rendererHost.querySelector<HTMLElement>("[data-role='annotation-overlay-surface']") }, rangeBandRef: { current: viewportElement.querySelector<HTMLElement>("[data-role='range-selection-band']") }, playheadRef: { current: rulerElement.querySelector<HTMLElement>("[data-role='playhead']") } },
      geometry: {
        getDisplayTimeMapping: () => timelineGeometry.displayMapping,
        getTimeAxisGeometry: () => timelineGeometry.timeAxis.geometry,
        getLocalGeometryMap: () => geometryMaps,
        sourceCycleToLocalX: (cycle) => timelineGeometry.sourceBoundaryToLocalX(sessionController.snapshot().document, cycle),
        sourceBoundaryToLocalX: (document, cycle) => timelineGeometry.sourceBoundaryToLocalX(document as CanonicalDocument, cycle),
        localXToScreenX: (localX) => localX,
      },
      viewport: { getMetrics: () => { const metrics = viewMetricsOwner.snapshot(); return { width: viewportElement.clientWidth, leftInset: metrics.leftPaneWidth + metrics.frozenPaneWidth }; }, getScrollState: () => ({ left: viewportElement.scrollLeft, top: viewportElement.scrollTop }), setScrollState: (state) => { if (state.left !== undefined) viewportElement.scrollLeft = state.left; if (state.top !== undefined) viewportElement.scrollTop = state.top; }, getZoom: timelineNavigation.getZoom, setZoom: timelineNavigation.setZoom },
      document: { getSnapshot: () => sessionController.snapshot().document, getCanonicalRevision: () => sessionController.snapshot().revision, getDocumentEpoch: () => documentEpoch.current() },
      render: { requestRender: (reason) => timelineRender(reason), requestOverlayRefresh: (reason) => { rendererHost.dataset.overlayRefreshReason = reason; const viewportQuery = timelineGeometry.viewportForLocalRange(viewportElement.scrollLeft / timelineGeometry.presentationScale, (viewportElement.scrollLeft + viewportElement.clientWidth) / timelineGeometry.presentationScale, viewportElement.scrollTop, viewportElement.scrollTop + viewportElement.clientHeight, documentEpoch.current(), selectedAnnotationRef.current ? [selectedAnnotationRef.current] : []); refreshRendererForReason(renderer, host, reason, sessionController.snapshot().document, projection, geometryMaps, mappingCache, timelineGeometry.presentationScale, timelineRangeRef.current, selectedCycleRef.current, selectedAnnotationRef.current, selectedEdgeRef.current, edgeCounterMetrics, viewportQuery); edgeCounterResolvePasses += 1; }, waitForRendererIdle: () => renderer.whenIdle().then(() => undefined) },
      lifecycle: { isCurrentEpoch: (epoch) => documentEpoch.isCurrent(epoch) },
    });
    timelineRuntimeRef.current = timelineRuntime;
    timelineRender = (reason) => {
      rendererHost.dataset.timelineRefreshReason = reason;
      if (reason === "scroll") {
        syncRulerScroll(rulerElement, viewportElement, timelineNavigation.getZoom());
        syncFrozenColumnScroll(viewportElement, rendererHost, viewMetricsOwner.snapshot().leftPaneWidth);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => projectViewportWindow({
          viewport: viewportElement,
          referenceClock: sessionController.snapshot().document.timeline.referenceClock,
          snapshot: sessionController.snapshot(),
          previous: { window, projection },
          projectionCoordinator,
          collapsedGroupIds: [...collapsedGroupIdsRef.current],
          onProjection: (nextProjection: RenderProjection, nextWindow: VirtualizationWindow, mountedSignalsChanged: boolean) => {
            window = nextWindow;
            projection = nextProjection;
            if (mountedSignalsChanged) timelineGeometry.invalidateSnapIndex();
            renderer.update(projection);
            rendererHost.dataset.viewportStartY = String(window.viewportStartY);
            publishState();
          },
        }));
        return;
      }
      const document = sessionController.snapshot().document;
      if (reason === "ruler") rulerBuilds += 1;
      const presentation = refreshTimelinePresentation({
        reason,
        document,
        ruler: rulerElement,
        grid: gridElement,
        viewport: viewportElement,
        host: rendererHost,
        rulerViewport: rulerViewportElement,
        geometryMaps,
        geometrySvgs,
        mappingCache,
        metricsOwner: viewMetricsOwner,
        currentZoom: timelineNavigation.getZoom(),
        previousScale: timelineGeometry.presentationScale,
        rulerInitialized,
        timeAxis: timelineGeometry.timeAxis,
        totalHeight: projection.totalHeight,
        gridEnabled: gridEnabledRef.current,
        markOpenPhase,
        onPlayhead: () => refreshPlayhead.current(),
        onRange: () => refreshRangeSelectionBand.current(),
        onResize: () => applyRendererHostSizing({ host, viewport, metrics: viewMetricsOwner.snapshot() }),
      });
      timelineGeometry.updatePresentation(presentation.timeAxis, presentation.screenGeometryScale);
      rulerInitialized = presentation.rulerInitialized;
      // Timeline presentation refreshes are view-only. The canonical command path
      // already submits the changed projection once; replaying that projection for
      // ruler/grid/zoom refreshes would regenerate the same WaveDrom rows.
      // Signal Split View (#200): grid lines mark shared cycle-boundary
      // x-positions from the one authoritative geometryMaps/mappingCache
      // (Upper's), same for every pane -- but each pane's grid must span
      // its OWN row content height, not Upper's, so this reuses Upper's
      // inputs with Lower's own totalHeight rather than cloning Upper's
      // grid DOM outright.
      if (reason === "grid" && gridLayerLower.current && signalSplitRuntimeRef.current) {
        const metrics = viewMetricsOwner.snapshot();
        refreshGridPresentation(gridLayerLower.current, document, geometryMaps, mappingCache, gridEnabledRef.current, signalSplitRuntimeRef.current.getTotalHeight(), globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth, presentation.screenGeometryScale);
      }
    };
    timelineRuntime.attach();
    transactionBoundaryX.current = (cycle) => timelineGeometry.sourceBoundaryToLocalX(sessionController.snapshot().document, cycle);
    const currentViewMetrics = () => {
      viewMetricsOwner.update({ viewportWidth: viewportElement.clientWidth, zoom: timelineNavigation.getZoom() });
      return viewMetricsOwner.snapshot();
    };
    const timelineOffset = () => {
      const metrics = currentViewMetrics();
      return metrics.leftPaneWidth + metrics.frozenPaneWidth;
    };
    const detachTimelineNavigation = timelineNavigation.attach({
      runtime: timelineRuntime,
      rendererHost,
      timingSurface: rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']") ?? rendererHost,
      viewport: viewportElement,
      ruler: rulerElement,
      scalable: [gridElement, ...rendererHost.querySelectorAll<HTMLElement>("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']")],
      rulerViewport: rulerViewportElement,
      viewMetrics: viewMetricsOwner,
      timelineOffset,
      getPresentationScale: () => timelineGeometry.presentationScale,
      syncPresentationScale,
      syncFrozenColumns: () => syncFrozenColumnScroll(viewportElement, rendererHost, viewMetricsOwner.snapshot().leftPaneWidth),
      getDocument: () => sessionController.snapshot().document,
      getRange: () => timelineRangeRef.current,
      setSelectedCycle,
      setRange: setTimelineRange,
      publishState,
    });
    syncFrozenColumnScroll(viewportElement, rendererHost, viewMetricsOwner.snapshot().leftPaneWidth);
    const cycleBoundaryAtX = createTimelineCycleBoundaryResolver({ rendererHost, timelineGeometry, getZoom: timelineNavigation.getZoom, isSnapEnabled: () => snapEnabledRef.current });
    const transactionSnapAxisY = (() => {
      const axisOwner = timelineGeometry.timeAxis.ownerSignalId;
      return axisOwner === undefined ? undefined : projection.rowLayout.find((row) => row.rowId === axisOwner)?.y;
    })();
    snapTransactionCycle.current = (clientX, surfaceLeft) => resolveTransactionSnapCycle({
      clientX,
      surfaceLeft,
      snapAxisRowY: transactionSnapAxisY,
      timeAxis: timelineGeometry.timeAxis,
      screenGeometry: timelineGeometry.screen,
      zoom: timelineNavigation.getZoom(),
      snapEnabled: snapEnabledRef.current,
      document: sessionController.snapshot().document,
      currentSnapIndex: () => timelineGeometry.currentSnapIndex(),
      cycleBoundaryAtPointerX: cycleBoundaryAtX,
      cycleBoundaryAtX,
      cycleBoundaryAtLocalX: (localX, zoom, snapEnabled) => timelineGeometry.cycleBoundaryAtLocalX(localX, zoom, snapEnabled),
    });
    publishState();

    const initialDocumentEpoch = documentEpoch.current();
    scheduleInitialTimelineRefresh(renderer, rendererHost, {
      ruler: () => { if (active) timelineRuntime.refreshRuler(); },
      range: () => { if (active) timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end); },
      playhead: () => { if (active) timelineRuntime.refreshPlayhead(); },
      grid: () => { if (active) timelineRuntime.refreshGrid(); },
      zoom: () => { if (active) timelineRuntime.setZoom(timelineNavigation.getZoom()); },
      overlays: () => { if (active) timelineRuntime.refreshOverlays(); },
      transactionPresentation: () => { if (active) setTransactionPresentationRevision((value) => value + 1); },
      collectErrors: () => { if (active) collectWaveErrors(); },
      publish: () => { if (active) publishState(); },
    }, { isCurrent: () => active && documentEpoch.isCurrent(initialDocumentEpoch) });

    const collectWaveErrors = () => {
      const failed = collectWaveRenderErrors(rendererHost);
      setRuntimeDiagnostics((current) => [...current.filter((item) => item.code !== "WAVE_RENDER_ERROR"), ...failed]);
      if (failed.length > 0) setProblem(failed[0]!.message);
    };

    const detachApplicationHandler = application.attachAcceptedHandler((result) => {
      delete rendererHost.dataset.editorIdle;
      projection = projectionCoordinator.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      const changed = result.changeSet;
      if (changed.fullDocumentReplace === true || changed.rowOrder !== undefined || changed.rowPresentation !== undefined || changed.addedSignals !== undefined || changed.removedSignals !== undefined || changed.addedGroups !== undefined || changed.removedGroups !== undefined) {
        setTreePresentationRevision((value) => value + 1);
      }
      if (changed.fullDocumentReplace === true || changed.transactionSemantics !== undefined) {
        setTransactionPresentationRevision((value) => value + 1);
      }
      if (changed.fullDocumentReplace === true) {
        timelineRuntime.onDocumentEpochChanged(documentEpoch.advance());
        interactionHandle?.cancel();
      }
      const invalidation = deriveRenderInvalidation(changed, result.snapshot.document.timeline.referenceClock);
      const snapDependenciesChanged = invalidation.snapDependenciesChanged;
      if (snapDependenciesChanged) timelineGeometry.invalidateSnapIndex();
      const refreshRuler = invalidation.refreshRuler;
      const refreshGridNow = invalidation.refreshGrid;
      const refreshOverlaysNow = invalidation.refreshOverlays;
      const rangePresentationAffected = refreshRuler
        || changed.geometryScreenX === true
        || changed.geometryScreenY !== undefined
        || changed.rowOrder !== undefined
        || changed.rowPresentation !== undefined
        || changed.addedSignals !== undefined
        || changed.removedSignals !== undefined
        || changed.addedGroups !== undefined
        || changed.removedGroups !== undefined;
      if (rangePresentationAffected) setRangePresentationRevision((value) => value + 1);
      const refreshPlayheadNow = changed.fullDocumentReplace === true || changed.geometryScreenX === true || refreshRuler;
      if (refreshPlayheadNow) setPlayheadPresentationRevision((value) => value + 1);
      renderer.update(projection);
      signalSplitRuntimeRef.current?.onDocumentChanged(result);
      setTimelineRange((range) => {
        const start = Math.min(range.start, result.snapshot.document.timeline.cycleCount - 1);
        const end = Math.max(start + 1, Math.min(range.end, result.snapshot.document.timeline.cycleCount));
        // Most property/style commits do not change the selected timeline
        // range. Preserve its identity so the range-selection effect does not
        // perform another DOM pass for an unchanged range.
        return range.start === start && range.end === end ? range : { start, end };
      });
      publishState();
      void renderer.whenIdle().then(() => {
        if (!active || !rendererHost.isConnected) return;
        if (refreshRuler && (!changed.fullDocumentReplace || !rulerInitialized)) {
          timelineRuntime.refreshRuler();
          timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end);
        }
        if (refreshPlayheadNow) timelineRuntime.refreshPlayhead();
        if (refreshGridNow) timelineRuntime.refreshGrid();
        timelineRuntime.setZoom(timelineNavigation.getZoom());
        if (refreshOverlaysNow) timelineRuntime.refreshOverlays();
        collectWaveErrors();
        publishState();
        rendererHost.dataset.editorIdle = "true";
      });
    });
    applyCollapsedGroupsRef.current = (ids) => {
      projection = projectionCoordinator.project({ snapshot: sessionController.snapshot(), changeSet: {}, viewport: window, previous: projection, collapsedGroupIds: [...ids] });
      timelineGeometry.invalidateSnapIndex();
      renderer.update(projection);
      signalSplitRuntimeRef.current?.onDocumentChanged({ snapshot: sessionController.snapshot(), changeSet: {} });
      timelineRuntime.refreshPlayhead();
      timelineRuntime.refreshGrid();
      timelineRuntime.refreshOverlays();
      publishState();
    };
    let interactionHandle: TimelineSurfaceInteractionHandle | undefined;
    const detachDocumentLifecycle = documentLifecycle.attachEffects({
      beginOpenMeasurement,
      markOpenPhase,
      applyReplacement: ({ document: canonicalDocument, documentEpoch: nextDocumentEpoch }) => {
      timelineRuntime.onDocumentEpochChanged(nextDocumentEpoch);
      resetInspectorAccordionState();
       interactionHandle?.cancel();
      pendingArrow = undefined;
      pendingArrowAnnotationType = "arrow";
      delete rendererHost.dataset.arrowPick;
      delete rendererHost.dataset.editorIdle;
      setBottomPinned(false);
      setPinnedBottomSelection(undefined);
      setRangeSelectionActive(false);
      rangeSelectionActiveRef.current = false;
      const replacementRange = { start: 0, end: Math.min(1, canonicalDocument.timeline.cycleCount) };
      timelineRangeRef.current = replacementRange;
      setTimelineRange(replacementRange);
      selectedCycleRef.current = 0;
      setSelectedCycle(0);
      selectedEdgeRef.current = undefined;
      selection.clear();
      setCollapsedGroups(new Set());
      setTreeFilter("");
      setTreeTypeFilter("all");
      setTreeAddMenuOpen(false);
      setTreeMoreMenuOpen(false);
      setContextMenu(undefined);
      setArrowPickStatus("idle");
      setRenameDialogOpen(false);
      treeFocusRowIdRef.current = undefined;
      geometryRegistry.clear();
      timelineGeometry.reset();
      rulerInitialized = false;
      // Open/New owns a deterministic viewport policy. Apply it before the
      // first projection so the previous document cannot seed stale rows.
      viewportElement.scrollLeft = 0;
      viewportElement.scrollTop = 0;
        window = buildViewportWindow(viewportElement, canonicalDocument.timeline.referenceClock);
      projection = projectionCoordinator.project({ snapshot: sessionController.snapshot(), changeSet: { fullDocumentReplace: true }, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      renderer.update(projection);
      signalSplitRuntimeRef.current?.onDocumentReplaced();
      markOpenPhase("canonical-replaced");
      markOpenPhase("renderer-updated");
      requestAnimationFrame(() => { if (active) markOpenPhase("row-shell-painted"); });
      rulerElement.replaceChildren();
      publishState();
      void renderer.whenIdle().then(() => {
        if (!active || !rendererHost.isConnected) return;
        timelineRuntime.refreshRuler();
        timelineRuntime.refreshPlayhead();
        timelineRuntime.refreshGrid();
        timelineRuntime.setZoom(timelineNavigation.getZoom());
        timelineRuntime.refreshOverlays();
        collectWaveErrors();
        publishState();
        markOpenPhase("all-visible-idle");
        rendererHost.dataset.editorIdle = "true";
      });
      },
    });

    const onViewportKeyDown = createTimelineViewportKeyDownHandler(viewportElement);
    let pendingArrow: "armed" | SemanticAnchor | undefined;
    // #375: the picked-transitions workflow is shared by both line-shaped
    // types that need real geometry-anchored endpoints -- Arrow and
    // Dependency -- so it must produce whichever type the Annotation type
    // dropdown currently has selected, not a type hardcoded to "arrow".
    let pendingArrowAnnotationType: "arrow" | "dependency" = "arrow";
    armArrowPick.current = (annotationType) => {
      pendingArrow = "armed";
      pendingArrowAnnotationType = annotationType;
      setArrowPickStatus("from");
      rendererHost.dataset.arrowPick = "from";
    };
    const leftTree = rendererHost.querySelector<HTMLElement>("[data-role='left-tree-rows']");
    const treeItems = () => [...(leftTree?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? [])].filter((item) => !item.hidden && !item.closest("[hidden]"));
    const focusTreeItem = (item: HTMLElement | undefined) => {
      if (!item || !leftTree) return;
      treeFocusRowIdRef.current = item.dataset.rowId;
      for (const candidate of leftTree.querySelectorAll<HTMLElement>("[role='treeitem']")) candidate.tabIndex = candidate === item ? 0 : -1;
      item.focus({ preventScroll: true });
      leftTree.dataset.focusRowId = item.dataset.rowId ?? "";
    };
    const focusTreeChild = (groupId: string) => focusTreeItem(treeItems().find((item) => item.dataset.groupId === groupId && item.dataset.groupHeader !== "true"));
    const onTreeKeyDown = (event: KeyboardEvent) => {
      if (!leftTree || !(event.target instanceof Element) || !leftTree.contains(event.target)) return;
      const item = event.target.closest<HTMLElement>("[role='treeitem']");
      const items = treeItems();
      if (items.length === 0) return;
      const active = item ?? items.find((candidate) => candidate.dataset.rowId === treeFocusRowIdRef.current) ?? items[0];
      if (!active) return;
      const index = items.indexOf(active);
      const move = (next: HTMLElement | undefined) => { if (next) { event.preventDefault(); event.stopPropagation(); focusTreeItem(next); requestAnimationFrame(() => focusTreeItem(next)); } };
      if (event.key === "ArrowDown") { move(items[Math.min(items.length - 1, index + 1)]); return; }
      if (event.key === "ArrowUp") { move(items[Math.max(0, index - 1)]); return; }
      if (event.key === "Home") { move(items[0]); return; }
      if (event.key === "End") { move(items.at(-1)); return; }
      if (event.key === "ArrowRight" && active.dataset.groupHeader === "true") {
        if (active.getAttribute("aria-expanded") === "false") {
          event.preventDefault();
          event.stopPropagation();
          active.querySelector<HTMLElement>("[data-role='tree-collapse']")?.click();
          requestAnimationFrame(() => focusTreeChild(active.dataset.groupId ?? ""));
        } else move(items.find((candidate) => candidate.dataset.groupId === active.dataset.groupId && candidate.dataset.groupHeader !== "true"));
        return;
      }
      if (event.key === "ArrowLeft") {
        if (active.dataset.groupHeader === "true" && active.getAttribute("aria-expanded") !== "false") {
          event.preventDefault();
          event.stopPropagation();
          active.querySelector<HTMLElement>("[data-role='tree-collapse']")?.click();
          requestAnimationFrame(() => focusTreeItem(active));
        } else if (active.dataset.groupHeader !== "true") {
          move(items.find((candidate) => candidate.dataset.groupId === active.dataset.groupId && candidate.dataset.groupHeader === "true"));
        }
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        const target = active.dataset.groupHeader === "true" ? active.querySelector<HTMLElement>("[data-role='tree-branch']") : active;
        target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: globalThis.window }));
        return;
      }
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        const rect = active.getBoundingClientRect();
        active.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, view: globalThis.window }));
      }
    };
    const onSelect = (event: MouseEvent) => {
      const closestFromEvent = <T extends Element>(selector: string): T | null => {
        const target = event.target instanceof Element ? event.target.closest<T>(selector) : null;
        if (target) return target;
        return event.composedPath().find((item): item is T => item instanceof Element && item.matches(selector)) ?? null;
      };
      const signalMore = closestFromEvent<HTMLElement>("[data-role='tree-more'][data-tree-signal-id]");
      if (signalMore?.dataset.treeSignalId) {
        event.preventDefault();
        event.stopPropagation();
        const signalId = signalMore.dataset.treeSignalId as SignalId;
        selection.selectSignal(signalId);
        setContextMenu({ x: event.clientX, y: event.clientY, target: "signal" });
        return;
      }
      const groupMore = closestFromEvent<HTMLElement>("[data-role='tree-group-more'][data-group-id]");
      if (groupMore?.dataset.groupId) {
        event.preventDefault();
        event.stopPropagation();
        const groupId = groupMore.dataset.groupId as GroupId;
        selection.selectGroup(groupId);
        setContextMenu({ x: event.clientX, y: event.clientY, target: "group" });
        return;
      }
      const collapseOwner = closestFromEvent<HTMLElement>("[data-role='tree-collapse'][data-group-id]");
      if (collapseOwner?.dataset.groupId) {
        event.preventDefault();
        event.stopPropagation();
        const groupId = collapseOwner.dataset.groupId as GroupId;
        toggleCollapsedGroup(groupId);
        return;
      }
      const visibilityOwner = closestFromEvent<HTMLElement>("[data-role='tree-visibility'][data-tree-signal-id]");
      if (visibilityOwner?.dataset.treeSignalId) {
        event.preventDefault();
        event.stopPropagation();
        const signalId = visibilityOwner.dataset.treeSignalId as SignalId;
        const signal = sessionController.snapshot().document.signals.find((candidate) => candidate.id === signalId);
        if (signal) {
          commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_visibility"), type: "signal.setVisibility", signalId, visible: signal.display.visible === false });
        }
        return;
      }
      const groupOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='tree-branch'][data-group-id]") : null;
      if (groupOwner?.dataset.groupId) {
        selection.selectGroup(groupOwner.dataset.groupId as GroupId);
        focusTreeItem(groupOwner.closest<HTMLElement>("[role='treeitem']") ?? undefined);
        return;
      }
      // Endpoint picking must win over annotation selection when an existing
      // overlay sits above the actual waveform.  The snap resolver still uses
      // semantic geometry; this only keeps the overlay from swallowing the
      // browser click before that resolver runs.
      if (pendingArrow && event.target instanceof Element && event.target.closest("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']")) {
        const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
        if (!waveLayer) return;
        const bounds = waveLayer.getBoundingClientRect();
        const currentZoom = timelineNavigation.getZoom();
        const localPointer = timelineGeometry.screenToLocal({ x: event.clientX - bounds.left, y: 0 }, currentZoom);
        const snap = timelineGeometry.currentSnapIndex().nearest({ x: localPointer.x, y: event.clientY - bounds.top }, 12 / currentZoom, ["clock-edge", "signal-transition", "bus-transition"]);
        publishState();
        if (!snap) {
          setProblem("No rendered transition is within the 12 px snap tolerance.");
          return;
        }
        if (pendingArrow === "armed") {
          pendingArrow = snap.anchor;
          setArrowPickStatus("to");
          rendererHost.dataset.arrowPick = "to";
          rendererHost.dataset.snapKind = snap.kind;
          return;
        }
        const annotation: Annotation = { id: nextEntityId("annotation", sessionController.snapshot().document) as AnnotationId, type: pendingArrowAnnotationType, label: "Transition", visible: true, color: "#d04a36", from: pendingArrow, to: snap.anchor, lineType: "straight", arrowhead: "end" };
        const result = application.execute({ id: nextCommandId("annotation_transition_arrow"), type: "annotation.create", annotation });
      if (result.ok) selection.selectAnnotation(annotation.id);
        pendingArrow = undefined;
        setArrowPickStatus("idle");
        delete rendererHost.dataset.arrowPick;
        rendererHost.dataset.snapKind = snap.kind;
        return;
      }
      const annotationOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]") : null;
      if (annotationOwner?.dataset.annotationId) {
        const id = annotationOwner.dataset.annotationId as AnnotationId;
        selection.selectAnnotation(id, event.ctrlKey || event.metaKey);
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
      const id = target?.dataset.rowId;
      if (!id) return;
      const spacerGroup = sessionController.snapshot().document.signalGroups.find((group) => group.rows.includes(id as SpacerId) && group.spacers?.some((spacer) => spacer.id === id));
      if (spacerGroup) {
        selection.selectSpacer(spacerGroup.id, id as SpacerId);
        focusTreeItem(target);
        return;
      }
      const signal = sessionController.snapshot().document.signals.find((candidate) => candidate.id === id);
      if (!signal) return;
      startTransition(() => selection.selectSignal(signal.id, event.ctrlKey || event.metaKey));
      const primary = selection.refs.signalId.current;
      if (primary) rendererHost.dataset.selectedSignalId = primary;
      focusTreeItem(target);
      // Selection decoration is synchronous for immediate feedback, while the
      // diagnostic/status snapshot is observational and can wait until the next
      // frame so selection input is not held behind JSON serialization.
      requestAnimationFrame(() => publishState());
    };
    const applyCanvasCycleSelection = (cycle: number, shiftKey: boolean) => {
      const cycleCount = sessionController.snapshot().document.timeline.cycleCount;
      if (cycle < 0 || cycle > cycleCount) return false;
      selectedEdgeRef.current = undefined;
      setRangeSelectionActive(true);
      setSelectedCycle(cycle);
      rendererHost.dataset.selectedCycle = String(cycle);
      if (shiftKey) {
        const anchor = timelineRangeRef.current.start;
        setTimelineRange({ start: Math.min(anchor, cycle), end: Math.min(cycleCount, Math.max(anchor, cycle) + 1) });
      } else if (cycle === cycleCount) {
        setTimelineRange({ start: Math.max(0, cycle - 1), end: cycle });
      } else {
        setTimelineRange({ start: cycle, end: cycle + 1 });
      }
      publishState();
      return true;
    };
    interactionHandle = attachTimelineSurfaceInteractions({
      rendererHost,
      viewportElement,
      rulerElement,
      rulerViewportElement,
      renderer,
      timelineGeometry,
      documentEpoch,
      getSnapshot: () => sessionController.snapshot(),
      timelineNavigation,
      timelineRuntime,
      getProjection: () => projection,
      getTimelineOffset: timelineOffset,
      getPendingArrow: () => pendingArrow,
      clearPendingArrow: () => { pendingArrow = undefined; },
      applyCanvasCycleSelection,
      onSelect,
      onTreeKeyDown,
      onScroll: () => {
        // Keep the sticky ruler in the same scroll transaction as the
        // scrollable overlay surface. The runtime render path is intentionally
        // coalesced, but ruler alignment must be immediate for pointer/test
        // observers that sample geometry in the same task.
        syncRulerScroll(rulerElement, viewportElement, timelineNavigation.getZoom());
        timelineRuntime.onViewportScroll();
      },
      onViewportKeyDown,
      selection,
      execute: (command) => { commandRegistry.current.execute<SemanticCommand>("semantic.execute", command); },
      executeBatch: (commands) => { executeBatch(nextCommandId("annotation_group_move"), commands); },
      commandRegistry,
      snapEnabledRef,
      timelineRangeRef,
      selectedCycleRef,
      selectedEdgeRef,
      lowerCanvasClickRef,
      menuOriginRef,
      suppressCanvasClickRef,
      setRangeSelectionActive,
      setRange: setTimelineRange,
      setSelectedCycle,
      setContextMenu,
      closeContextMenu,
      setArrowPickStatus,
      publishState,
      refreshRangePreview,
    });
    return () => {
      active = false;
      applyCollapsedGroupsRef.current = () => undefined;
      refreshPlayhead.current = () => undefined;
      lowerCanvasClickRef.current = () => undefined;
      detachTimelineNavigation();
      cancelAnimationFrame(frame);
      interactionHandle?.detach();
      timelineRuntime.detach();
      timelineRuntime.dispose();
      timelineRuntimeRef.current = null;
      detachApplicationHandler();
      detachDocumentLifecycle();
      armArrowPick.current = () => undefined;
      snapTransactionCycle.current = () => undefined;
      renderCoordinator.dispose();
    };
    },
  };
}
