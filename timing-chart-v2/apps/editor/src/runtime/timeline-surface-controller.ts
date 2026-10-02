import { startTransition } from "react";
import { flushSync } from "react-dom";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { getRowLayoutSourceIndex, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import type { AnnotationId, CanonicalDocument, DocumentProblem, GroupId, SignalId, SpacerId, TransactionId } from "@timing-chart-v2/schema";
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
import { TimelineGeometryOwner, usesFullDocumentWaveformWindow } from "./timeline-geometry-owner.js";
import { deriveRenderInvalidation } from "./render-invalidation.js";
import { createTimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { resolveTransactionSnapCycle } from "./interaction-controller.js";
import { scheduleInitialTimelineRefresh } from "./document-lifecycle-controller.js";
import { refreshRendererForReason } from "./render-coordinator.js";
import { createWaveformSurfaceProvider } from "./waveform-surface-provider.js";
import { refreshWaveCanvasViewport } from "./canvas-wave-painter.js";
import { initialWaveSignalIds, mountInitialTimelineProjection, projectViewportWindow, projectionForInitialWaveBootstrap } from "./viewport-projection.js";
import { fixedColumnsOutsideTimeline, timelineScrollOwner } from "./timeline-scroll-owner.js";
import { refreshGridPresentation, refreshPlayheadPresentation, refreshRangeBandPresentation, refreshRulerAndGridIfNeeded, refreshTimelinePresentation, syncPresentationScale, syncRulerScroll } from "./timeline-presentation-refresh.js";
import { attachTimelineSurfaceInteractions, createTimelineCycleBoundaryResolver, createTimelineViewportKeyDownHandler, type TimelineSurfaceInteractionHandle } from "./timeline-surface-interactions.js";
import { collectWaveRenderErrors, createOpenPhaseTracker } from "./runtime-diagnostics.js";
import { publishRendererState } from "./runtime-diagnostics.js";
import { applyRendererHostSizing } from "./renderer-host-sizing.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { nextCommandId } from "../command-id.js";
import type { BottomPinnedSelection, TreeTypeFilter } from "../workspace/use-workspace-ui-state.js";
import type { ContextMenuState } from "../workspace/use-dialog-menu-state.js";
import { resetInspectorAccordionState } from "../inspector-accordion.js";
import { deriveTransactionExtent } from "./transaction-extent.js";
import { createTransactionPresentationRefreshRequester, shouldRefreshTransactionPresentation } from "./transaction-presentation-refresh.js";
import { createTreeKeyboardController } from "./tree-keyboard-controller.js";
import { TransitionArrowPicker } from "./transition-arrow-picker.js";

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
  readonly getPinnedSignalIds: () => readonly SignalId[];
  readonly collapsedGroupIdsRef: MutableRefObject<ReadonlySet<GroupId>>;
  readonly applyCollapsedGroupsRef: MutableRefObject<(ids: ReadonlySet<GroupId>) => void>;
  readonly forceUpperReprojectRef: MutableRefObject<() => void>;
  readonly lowerCanvasClickRef: MutableRefObject<(event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => void>;
  readonly timelineRuntimeRef: MutableRefObject<TimelineViewportRuntime | null>;
  readonly armArrowPick: MutableRefObject<(annotationType: "arrow" | "dependency") => void>;
  readonly snapTransactionCycle: MutableRefObject<(clientX: number, surfaceLeft?: number, horizontalScroll?: number) => number | undefined>;
  readonly transactionBoundaryX: MutableRefObject<(cycle: number) => number | undefined>;
  readonly transactionSourceWindow: MutableRefObject<(viewport: HTMLElement) => Readonly<{ start: number; end: number }> | undefined>;
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
  readonly transactionCyclesPerTcRef: MutableRefObject<number>;
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
  readonly setPinnedSignalIds: (ids: readonly SignalId[]) => void;
  readonly setTreeFilter: Setter<string>;
  readonly setTreeTypeFilter: Setter<TreeTypeFilter>;
  readonly setTreeAddMenuOpen: Setter<boolean>;
  readonly setTreeMoreMenuOpen: Setter<boolean>;
  readonly setContextMenu: Setter<ContextMenuState | undefined>;
  readonly setArrowPickStatus: Setter<"idle" | "from" | "to">;
  readonly setRenameDialogOpen: Setter<boolean>;
  readonly setCollapsedGroups: (next: ReadonlySet<GroupId>) => void;
  readonly resetCollapsedGroups: () => void;
  readonly resetForDocument: (cycleCount: number) => void;
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
  readonly viewMode: "Cycle" | "Transaction" | "Split";
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
  const { collapsedGroupIdsRef, applyCollapsedGroupsRef, forceUpperReprojectRef, lowerCanvasClickRef, timelineRuntimeRef, armArrowPick, snapTransactionCycle, transactionBoundaryX, transactionSourceWindow, refreshPlayhead, refreshRangeSelectionBand, publishStateRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef, selectedAnnotationRef, gridEnabledRef, snapEnabledRef, treeFocusRowIdRef, suppressCanvasClickRef, menuOriginRef, transactionCyclesPerTcRef } = input.presentation;
  const { setRuntimeDiagnostics, setProblem, setTreePresentationRevision, setTransactionPresentationRevision, setRangePresentationRevision, setPlayheadPresentationRevision, setTimelineRange, setRangeSelectionActive, setSelectedCycle, setBottomPinned, setPinnedBottomSelection, setPinnedSignalIds, setTreeFilter, setTreeTypeFilter, setTreeAddMenuOpen, setTreeMoreMenuOpen, setContextMenu, setArrowPickStatus, setRenameDialogOpen, resetForDocument, toggleCollapsedGroup, closeContextMenu } = input.state;
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
    let markOpenPhase: (phase: string, timestamp?: number) => void = () => undefined;
    const openPhaseTracker = createOpenPhaseTracker(rendererHost, undefined, () => {
      input.application.runPendingTimingDiagnostics(() => markOpenPhase("diagnostics-ready"));
    });
    markOpenPhase = openPhaseTracker.mark;
    const beginOpenMeasurement = openPhaseTracker.begin;
    // Direct reload/startup has no File Open command to begin the phase
    // tracker. Start the same measurement contract for the initial mount so
    // startup latency is observable without changing the render path.
    beginOpenMeasurement();
    let projection!: RenderProjection;
    let referenceGeometryReconciled = false;
    let primaryPresentationOpening = true;
    let primaryPresentationGeneration = 0;
    const requestTransactionPresentationRefresh = createTransactionPresentationRefreshRequester({
      getViewMode: () => input.viewMode,
      getGeneration: () => primaryPresentationGeneration,
      getDocumentEpoch: () => documentEpoch.current(),
      isActive: () => active,
      isDocumentEpochCurrent: (epoch) => documentEpoch.isCurrent(epoch),
      scheduleFrame: (callback) => {
        if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => startTransition(callback));
        else globalThis.setTimeout(() => startTransition(callback), 0);
      },
      publish: () => setTransactionPresentationRevision((value) => value + 1),
    });
    let transactionExtentSource: CanonicalDocument["transactions"] | undefined;
    let transactionExtent: Readonly<{ start: number; end: number }> | undefined;
    let publishState: () => void = () => undefined;
    let pendingOpenDiagnosticPublish = false;
    let diagnosticPublishFrame = 0;
    const requestDiagnosticPublish = (): void => {
      if (!active) return;
      if (primaryPresentationOpening) {
        pendingOpenDiagnosticPublish = true;
        return;
      }
      if (diagnosticPublishFrame !== 0) return;
      const publish = () => {
        diagnosticPublishFrame = 0;
        if (!active || !rendererHost.isConnected) return;
        publishState();
      };
      if (typeof globalThis.requestAnimationFrame === "function") diagnosticPublishFrame = globalThis.requestAnimationFrame(publish);
      else diagnosticPublishFrame = globalThis.setTimeout(publish, 0) as unknown as number;
    };
    const flushOpenDiagnosticPublish = (): void => {
      if (!pendingOpenDiagnosticPublish) return;
      pendingOpenDiagnosticPublish = false;
      requestDiagnosticPublish();
    };
    const timelineGeometry = new TimelineGeometryOwner({
      mappingCache,
      geometryMaps,
      getDocument: () => sessionController.snapshot().document,
      getProjection: () => projection,
      // Building the cached SnapIndex may happen on the first drag preview
      // query. Diagnostics are observational and must not synchronously
      // publish from that pointermove hot path; later lifecycle/interaction
      // refreshes publish the updated snapshot when appropriate.
      onSnapIndexBuilt: () => undefined,
    });
    const provider = createWaveformSurfaceProvider({
      sessionController,
      getDocumentEpoch: () => projectionCoordinator.currentDocumentEpoch(),
      mappingCache,
      adapter,
      geometryRegistry,
      markOpenPhase,
      recordOpenWaveBatch: openPhaseTracker.recordWaveBatch,
      isPresentationReady: () => {
        const readiness = rendererHost.dataset.openReadiness;
        return readiness === "presentation-ready" || readiness === "visible-waveforms-ready" || readiness === "idle";
      },
      isPrimaryPresentationOpening: () => primaryPresentationOpening,
      getTimeAxisMetrics: () => timelineGeometry.timeAxisMetrics,
      isTimeAxisMetricsCurrent: (generation) => timelineGeometry.timeAxisMetrics.generation === generation,
      onReferenceGeometryReady: () => {
        if (active) {
          refreshRulerAndGridIfNeeded(
            () => rulerInitialized,
            () => timelineRuntimeRef.current?.refreshRuler(),
            () => timelineRuntimeRef.current?.refreshGrid(),
          );
        }
        // The first bounded source window is selected before reference
        // geometry exists. Once that geometry arrives, re-run projection so
        // StableTimingChartRenderer can observe the authoritative window and
        // queue the bounded semantic render instead of retaining the initial
        // presentation-thinned WaveDrom artifact.
        if (active && projection !== undefined && !referenceGeometryReconciled) {
          referenceGeometryReconciled = true;
          // TransactionLanes may have memoized an empty shared-boundary
          // projection before this document's Cycle geometry was published.
          // Invalidate once at the first geometry-ready boundary; later
          // virtualized owner remounts must not reproject bars during scroll.
          requestTransactionPresentationRefresh();
          // Small/medium documents always render one full-document waveform
          // window. Reference geometry therefore changes the ruler/Transaction
          // projection state, but cannot change the WaveDrom request set; avoid
          // invalidating that complete first batch and rendering it again.
          const currentDocument = sessionController.snapshot().document;
          if (usesFullDocumentWaveformWindow(currentDocument.timeline.cycleCount, currentDocument.signals.length)) return;
          return new Promise<void>((resolve) => {
            const reproject = () => {
              try { if (active && projection !== undefined) renderCoordinator.renderer.update(projection); }
              finally { resolve(); }
            };
            if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(reproject);
            else globalThis.setTimeout(reproject, 0);
          });
        }
      },
      invalidateSnapIndex: () => timelineGeometry.invalidateSnapIndex(),
      getViewMode: () => input.viewMode,
      getSourceWindow: (owner) => {
        const viewport = timelineScrollOwner(owner.closest<HTMLElement>(".cycle-viewport") ?? viewportElement);
        const document = sessionController.snapshot().document;
        const timeAxisMetrics = timelineGeometry.timeAxisMetrics;
        const localScale = timeAxisMetrics.presentationScale * timeAxisMetrics.zoom;
        const window = timelineGeometry.sourceWindowForLocalRange(document, viewport.scrollLeft / localScale, (viewport.scrollLeft + viewport.clientWidth) / localScale);
        // Transaction bars are projected from the same Cycle geometry. For a
        // small/medium document, retain boundaries covering the canonical
        // transaction span so a Transaction view can render bars outside the
        // currently visible Cycle viewport without inventing a second mapper.
        // Large timelines keep the bounded viewport path owned by geometry.
        if (document.transactions !== transactionExtentSource) {
          transactionExtentSource = document.transactions;
          transactionExtent = deriveTransactionExtent(document.transactions);
        }
        const activeViewMode = owner.closest<HTMLElement>("[data-view-mode]")?.dataset.viewMode;
        // Cycle-only rendering does not consume Transaction bar geometry.
        // Keep its WaveDrom window viewport-bounded; Transaction and Combined
        // retain the shared canonical transaction extent for bar alignment.
        if (activeViewMode !== "Cycle" && transactionExtent && transactionExtent.end - transactionExtent.start <= 4096) {
          return { start: Math.min(window.start, transactionExtent.start), end: Math.max(window.end, transactionExtent.end) };
        }
        return window;
      },
    });
    const renderCoordinator = runtime.createRenderer(provider);
    const renderer = renderCoordinator.renderer;
    const initialDocument = sessionController.snapshot().document;
    const bootstrapReferenceClock = initialDocument.timeline.referenceClock
      ?? initialDocument.signals.find((signal) => signal.type === "clock")?.id;
    const initialWaveIds = initialWaveSignalIds(initialDocument);
    const initialProjection = mountInitialTimelineProjection({
      coordinator: renderCoordinator,
      renderer,
      host: rendererHost,
      viewport: viewportElement,
      referenceClock: bootstrapReferenceClock,
      stickyRowIds: input.presentation.getPinnedSignalIds(),
      projectionCoordinator,
      snapshot: sessionController.snapshot(),
      collapsedGroupIds: [...collapsedGroupIdsRef.current],
      ...(initialWaveIds === undefined ? {} : { initialWaveSignalIds: initialWaveIds }),
    });
    let window: VirtualizationWindow = initialProjection.window;
    projection = initialProjection.projection;
    markOpenPhase("canonical-replaced");
    markOpenPhase("renderer-updated");
    requestAnimationFrame(() => { if (active) markOpenPhase("row-shell-painted"); });
    const initialPresentationGeneration = primaryPresentationGeneration;
    // Signal Split View (#200): lets the signalSplitEnabled effect force
    // Upper to reproject/re-render immediately after flipping
    // `projectionCoordinator.setPane()`, using the CURRENT document (not a
    // change -- Split toggling itself is view-only, so this must never
    // touch history/dirty/canonical state).
    const surfaceViewMode = () => rendererHost.closest<HTMLElement>("[data-view-mode]")?.dataset.viewMode;
    const surfacePresentation = () => {
      const surface = rendererHost.closest<HTMLElement>("[data-view-mode]");
      return `${surface?.dataset.viewMode ?? ""}:${surface?.dataset.signalSplit ?? "false"}`;
    };
    let lastReprojectPresentation = surfacePresentation();
    forceUpperReprojectRef.current = () => {
      if (!active) return;
      // Transaction mode defers every non-reference waveform (see
      // waveform-surface-provider). Leaving it must re-queue those signals or
      // they stay blank until an unrelated edit: the renderer only paints
      // dirty/new owners, and the deferred batch already cleared their dirty flag.
      const viewMode = surfaceViewMode();
      const previousMode = lastReprojectPresentation.split(":", 1)[0];
      const currentPresentation = surfacePresentation();
      const reprojectModeChanged = lastReprojectPresentation !== currentPresentation;
      const leavingDeferredMode = previousMode === "Transaction" && viewMode !== "Transaction";
      lastReprojectPresentation = currentPresentation;
      // The Cycle viewport has zero height while another mode is active, so a
      // window built then hides every row/annotation candidate; rebuild it now.
      if (leavingDeferredMode) window = buildViewportWindow(viewportElement, sessionController.snapshot().document.timeline.referenceClock, input.presentation.getPinnedSignalIds());
      // An empty changeSet is correct here, not `fullDocumentReplace` --
      // `projectionCoordinator.setPane()` already nulled the cached layout,
      // so the very next `project()` call rebuilds regardless of changeSet
      // flags. Declaring a fake full-document-replace would incorrectly
      // advance documentEpoch and clear annotation preview state for a
      // toggle that must be canonical/history/dirty-neutral.
      const reprojectSnapshot = sessionController.snapshot();
      // Only owners that never received an SVG (deferred while Transaction mode was active) need a paint;
      // already-painted waves must not re-render on every mode round trip.
      const paintedSignalIds = new Set(leavingDeferredMode ? [...rendererHost.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-signal-id]")].filter((owner) => owner.querySelector("svg, canvas[data-wave-canvas]") !== null).map((owner) => owner.dataset.signalId as SignalId) : []);
      const unpaintedSignalIds = leavingDeferredMode ? reprojectSnapshot.document.signals.map((signal) => signal.id).filter((id) => !paintedSignalIds.has(id)) : [];
      projection = projectionCoordinator.project({ snapshot: reprojectSnapshot, changeSet: unpaintedSignalIds.length > 0 ? { waveSemantics: unpaintedSignalIds } : {}, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      renderer.update(projection);
      if (reprojectModeChanged) {
        for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-wave-renderer='canvas']")) {
          refreshWaveCanvasViewport(owner);
        }
      }
      // Horizontal scroll re-publishes the previous projection; do not carry the
      // one-shot wave invalidation into every later scroll frame.
      if (projection.waveSignalIds.length > 0) projection = { ...projection, waveSignalIds: [] };
      // A mode/pane-only reproject can make deferred signal waves renderable.
      // Annotation anchors depend on those signal geometry maps, so refresh
      // overlays after the renderer batch finishes rather than resolving
      // against stale pre-batch geometry and waiting for an unrelated edit.
      void renderer.whenIdle().then(() => {
        if (active) timelineRuntimeRef.current?.refreshOverlays();
      });
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
      // #937: the Zoom preset path publishes navigation zoom before the geometry generation catches up; publish it before placing the band.
      if (timelineGeometry.timeAxisMetrics.zoom !== timelineNavigation.getZoom()) timelineGeometry.updateZoom(timelineNavigation.getZoom());
      const metrics = timelineGeometry.timeAxisMetrics;
      const document = sessionController.snapshot().document;
      const boundaryToLocalX = (cycle: number, snapshot: typeof metrics) => timelineGeometry.sourceBoundaryToLocalX(document, cycle, snapshot);
      refreshRangeBandPresentation(viewportElement, rulerElement, rendererHost, rangeSelectionActiveRef.current, rendererHost.dataset.rangePreview, timelineRangeRef.current, boundaryToLocalX, metrics, timelineOffset(), projection.totalHeight);
      // Signal Split View (#200): the range band's horizontal extent comes
      // from the one shared time mapping, but its vertical extent must span
      // Lower's OWN row content, not Upper's -- reusing Upper's totalHeight
      // here would stretch/shrink the band to the wrong pane's height.
      if (viewportLower.current && rulerLower.current && signalSplitRuntimeRef.current) refreshRangeBandPresentation(viewportLower.current, rulerLower.current, rendererHost, rangeSelectionActiveRef.current, rendererHost.dataset.rangePreview, timelineRangeRef.current, boundaryToLocalX, metrics, timelineOffset(), signalSplitRuntimeRef.current.getTotalHeight());
    };
    refreshRangeSelectionBand.current = refreshRangeSelectionBandNow;
    const refreshRangePreview = () => {
      timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end);
    };

    publishState = () => publishRendererState(rendererHost, sessionController.current(), viewMetricsOwner, adapter, geometryRegistry, projectionCoordinator, renderer, mappingCache, timelineGeometry.snapService, timelineGeometry.snapIndex, rulerBuilds, edgeCounterResolvePasses, timelineNavigation.getZoom(), application.validatorInvocationsRef.current, edgeCounterMetrics);
    publishStateRef.current = () => publishState();
    let frame = 0;
    let scrollOverlayRefreshGeneration = 0;
    // Definite-assignment: assigned below before the viewport runtime's
    // returned closures can ever be invoked (matches this file's rangeInteractions/
    // treeDrag forward-declaration convention); no dummy body is reachable.
    let timelineRender!: (reason: string) => void;
    const timelineRuntime = createTimelineViewportRuntime({
      dom: { viewportRef: { current: viewportElement }, waveformRef: { current: rendererHost }, rulerRef: { current: rulerElement }, gridRef: { current: gridElement }, overlayRef: { current: rendererHost.querySelector<HTMLElement>("[data-role='annotation-overlay-surface']") }, rangeBandRef: { current: viewportElement.querySelector<HTMLElement>("[data-role='range-selection-band']") }, playheadRef: { current: rulerElement.querySelector<HTMLElement>("[data-role='playhead']") } },
      geometry: {
        getTimeAxisMetrics: () => timelineGeometry.timeAxisMetrics,
        getTimeAxisGeometry: () => timelineGeometry.timeAxis.geometry,
        getLocalGeometryMap: () => geometryMaps,
        sourceCycleToLocalX: (cycle) => timelineGeometry.sourceBoundaryToLocalX(sessionController.snapshot().document, cycle),
        sourceBoundaryToLocalX: (document, cycle) => timelineGeometry.sourceBoundaryToLocalX(document as CanonicalDocument, cycle),
      requestSourceCycle: (cycle) => timelineGeometry.requestSourceCycle(cycle),
      clearRequestedSourceCycle: () => timelineGeometry.clearRequestedSourceCycle(),
        localXToScreenX: (localX) => localX,
      },
      viewport: { getMetrics: () => { const metrics = viewMetricsOwner.snapshot(); return { width: timelineScrollOwner(viewportElement).clientWidth, leftInset: fixedColumnsOutsideTimeline(viewportElement) ? 0 : metrics.leftPaneWidth + metrics.frozenPaneWidth }; }, getScrollState: () => ({ left: timelineScrollOwner(viewportElement).scrollLeft, top: viewportElement.scrollTop }), setScrollState: (state) => { if (state.left !== undefined) timelineScrollOwner(viewportElement).scrollLeft = state.left; if (state.top !== undefined) viewportElement.scrollTop = state.top; }, getZoom: timelineNavigation.getZoom, setZoom: (zoom) => { timelineNavigation.setZoom(zoom); timelineGeometry.updateZoom(zoom); } },
      document: { getSnapshot: () => sessionController.snapshot().document, getCanonicalRevision: () => sessionController.snapshot().revision, getDocumentEpoch: () => documentEpoch.current() },
      render: { requestRender: (reason) => timelineRender(reason), requestOverlayRefresh: (reason) => { rendererHost.dataset.overlayRefreshReason = reason; const timeAxisMetrics = timelineGeometry.timeAxisMetrics; const viewport = timelineScrollOwner(viewportElement); const localScale = timeAxisMetrics.presentationScale * timeAxisMetrics.zoom; const viewportQuery = timelineGeometry.viewportForLocalRange(viewport.scrollLeft / localScale, (viewport.scrollLeft + viewport.clientWidth) / localScale, viewportElement.scrollTop, viewportElement.scrollTop + viewportElement.clientHeight, documentEpoch.current(), selectedAnnotationRef.current ? [selectedAnnotationRef.current] : []); refreshRendererForReason(renderer, host, reason, sessionController.snapshot().document, projection, geometryMaps, timeAxisMetrics, timelineRangeRef.current, selectedCycleRef.current, selectedAnnotationRef.current, selectedEdgeRef.current, edgeCounterMetrics, viewportQuery); edgeCounterResolvePasses += 1; }, waitForRendererIdle: () => renderer.whenIdle().then(() => undefined) },
      lifecycle: { isCurrentEpoch: (epoch) => documentEpoch.isCurrent(epoch) },
    });
    timelineRuntimeRef.current = timelineRuntime;
    timelineRender = (reason) => {
      rendererHost.dataset.timelineRefreshReason = reason;
      if (reason === "scroll") {
        syncRulerScroll(rulerElement, viewportElement, timelineGeometry.timeAxisMetrics.zoom);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => projectViewportWindow({
          viewport: viewportElement,
          referenceClock: sessionController.snapshot().document.timeline.referenceClock,
          stickyRowIds: input.presentation.getPinnedSignalIds(),
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
            // Annotation overlays are viewport-filtered too. A scroll can
            // move a previously-offscreen source anchor into view without
            // changing the mounted Signal rows; refresh after any newly
            // requested geometry has settled, and discard superseded scroll
            // continuations so rapid scrolling publishes only the latest
            // viewport's overlays.
            const refreshGeneration = ++scrollOverlayRefreshGeneration;
            const refreshEpoch = documentEpoch.current();
            void renderer.whenIdle().then(() => {
              if (!active || !rendererHost.isConnected || refreshGeneration !== scrollOverlayRefreshGeneration || !documentEpoch.isCurrent(refreshEpoch)) return;
              timelineRuntime.refreshOverlays();
            });
          },
        }));
        return;
      }
      if (reason === "navigate-cycle") renderer.update(projection);
      const document = sessionController.snapshot().document;
      if (reason === "ruler") rulerBuilds += 1;
      const scaleBefore = timelineGeometry.presentationScale;
      const presentation = refreshTimelinePresentation({
        reason,
        document,
        cyclesPerTc: transactionCyclesPerTcRef.current,
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
        previousScale: scaleBefore,
        rulerInitialized,
        timeAxis: timelineGeometry.timeAxis,
        totalHeight: projection.totalHeight,
        gridEnabled: gridEnabledRef.current,
        markOpenPhase,
        onPlayhead: () => refreshPlayhead.current(),
        onRange: () => refreshRangeSelectionBand.current(),
        onResize: () => applyRendererHostSizing({ host, viewport, metrics: viewMetricsOwner.snapshot() }),
        publishTimeAxisMetrics: (timeAxis, scale, width, origin, zoom) => timelineGeometry.updatePresentation(timeAxis, scale, width, origin, zoom),
        publishTimeAxisZoom: (zoom) => timelineGeometry.updateZoom(zoom),
        getTimeAxisMetrics: () => timelineGeometry.timeAxisMetrics,
      });
      // #750: a changed geometry scale (cyclesPerTC compression on/off or a new factor) moves every Transaction X; bars/Phases/Bookmarks
      // are memoized on the presentation revision, so publish it.
      if (Math.abs(timelineGeometry.presentationScale - scaleBefore) > 1e-9) { setTransactionPresentationRevision((value) => value + 1); requestAnimationFrame(() => timelineNavigation.setZoom(timelineNavigation.getZoom())); }
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
      if (reason !== "scroll" && gridLayerLower.current && signalSplitRuntimeRef.current) { // #937: Lower follows every Upper grid refresh (zoom, fit, ruler, resize), not only the "grid" reason
        const metrics = viewMetricsOwner.snapshot();
        refreshGridPresentation(gridLayerLower.current, document, geometryMaps, mappingCache, gridEnabledRef.current, signalSplitRuntimeRef.current.getTotalHeight(), globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth, presentation.screenGeometryScale, transactionCyclesPerTcRef.current, timelineGeometry.timeAxisMetrics);
        gridLayerLower.current.style.transformOrigin = "0 0"; gridLayerLower.current.style.scale = `${timelineNavigation.getZoom()} 1`; // same CSS zoom as Upper's grid
      }
    };
    timelineRuntime.attach();
    transactionBoundaryX.current = (cycle) => timelineGeometry.sourceBoundaryToLocalX(sessionController.snapshot().document, cycle);
    transactionSourceWindow.current = (sourceViewport) => {
      const document = sessionController.snapshot().document;
      const timeAxisMetrics = timelineGeometry.timeAxisMetrics;
      const localScale = timeAxisMetrics.presentationScale * timeAxisMetrics.zoom;
      if (!Number.isFinite(localScale) || localScale <= 0 || sourceViewport.clientWidth <= 0) return undefined;
      const sharedViewport = timelineScrollOwner(sourceViewport);
      return timelineGeometry.visibleSourceRangeForLocalRange(
        document,
        sharedViewport.scrollLeft / localScale,
        (sharedViewport.scrollLeft + sharedViewport.clientWidth) / localScale,
      );
    };
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
      extraScalable: () => (gridLayerLower.current ? [gridLayerLower.current] : []), rulerViewport: rulerViewportElement,
      viewMetrics: viewMetricsOwner,
      timelineOffset,
      getPresentationScale: () => timelineGeometry.presentationScale,
      syncPresentationScale,
      getDocument: () => sessionController.snapshot().document,
      getRange: () => timelineRangeRef.current,
      setSelectedCycle,
      setRange: setTimelineRange,
      publishState,
    });
    const cycleBoundaryAtX = createTimelineCycleBoundaryResolver({ rendererHost, timelineGeometry, isSnapEnabled: () => snapEnabledRef.current });
    snapTransactionCycle.current = (clientX, surfaceLeft, horizontalScroll = 0) => {
      const timeAxisMetrics = timelineGeometry.timeAxisMetrics;
      const axisOwner = timeAxisMetrics.timeAxis.ownerSignalId;
      const snapAxisRowY = axisOwner === undefined ? undefined : projection.rowLayout.find((row) => row.rowId === axisOwner)?.y;
      return resolveTransactionSnapCycle({
        clientX, surfaceLeft, horizontalScroll,
        snapAxisRowY,
        timeAxisMetrics,
        screenGeometry: timelineGeometry.screen,
        snapEnabled: snapEnabledRef.current,
        document: sessionController.snapshot().document,
        currentSnapIndex: () => timelineGeometry.currentSnapIndex(),
        cycleBoundaryAtPointerX: cycleBoundaryAtX,
        cycleBoundaryAtX,
        cycleBoundaryAtLocalX: (localX, snapEnabled) => timelineGeometry.cycleBoundaryAtLocalX(localX, snapEnabled),
      });
    };
    const initialDocumentEpoch = documentEpoch.current();
    scheduleInitialTimelineRefresh(renderer, rendererHost, {
      ruler: () => { if (active) timelineRuntime.refreshRuler(); },
      range: () => { if (active) timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end); },
      playhead: () => { if (active) timelineRuntime.refreshPlayhead(); },
      grid: () => { if (active) timelineRuntime.refreshGrid(); },
      zoom: () => { if (active) timelineRuntime.setZoom(timelineNavigation.getZoom()); },
      overlays: () => { if (active) timelineRuntime.refreshOverlays(); },
      transactionPresentation: requestTransactionPresentationRefresh,
      collectErrors: () => { if (active) collectWaveErrors(); },
      publish: () => { if (active) publishState(); },
      onPresentationReady: () => {
        if (!active || primaryPresentationGeneration !== initialPresentationGeneration) return;
        markOpenPhase("visible-waveforms-ready");
        markOpenPhase("all-visible-idle");
        primaryPresentationOpening = false;
        // scheduleInitialTimelineRefresh already queues one diagnostic
        // publication after this visual-ready boundary.
        pendingOpenDiagnosticPublish = false;
      },
    }, { isCurrent: () => active && documentEpoch.isCurrent(initialDocumentEpoch) });

    const collectWaveErrors = () => {
      const failed = collectWaveRenderErrors(rendererHost);
      setRuntimeDiagnostics((current) => [...current.filter((item) => item.code !== "WAVE_RENDER_ERROR"), ...failed]);
      if (failed.length > 0) setProblem(failed[0]!.message);
    };

    let acceptedCommandGeneration = 0;
    const detachApplicationHandler = application.attachAcceptedHandler((result, context) => {
      const commandGeneration = ++acceptedCommandGeneration;
      delete rendererHost.dataset.editorIdle;
      delete rendererHost.dataset.cycleViewReady;
      let openingGenerationForCompletion: number | undefined;
      projection = projectionCoordinator.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      const changed = result.changeSet;
      const transactionOnlyChange = changed.transactionSemantics !== undefined
        && Object.keys(changed).every((key) => key === "transactionSemantics");
      if (changed.fullDocumentReplace === true || changed.rowOrder !== undefined || changed.rowPresentation !== undefined || changed.addedSignals !== undefined || changed.removedSignals !== undefined || changed.addedGroups !== undefined || changed.removedGroups !== undefined) {
        setTreePresentationRevision((value) => value + 1);
      }
      const currentViewMode = surfaceViewMode();
      const presentationMode = currentViewMode === "Split" || currentViewMode === "Transaction" ? currentViewMode : "Cycle";
      if (shouldRefreshTransactionPresentation(presentationMode, changed)) {
        setTransactionPresentationRevision((value) => value + 1);
      }
      if (changed.fullDocumentReplace === true) {
        primaryPresentationOpening = true;
        openingGenerationForCompletion = ++primaryPresentationGeneration;
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
      // Transaction edits are rendered by TransactionLanes. They do not
      // change WaveDrom signal geometry, so avoid rebuilding the waveform
      // renderer on every inspector/bottom-table commit in large documents.
      const presentationOnlyChange = changed.rowPresentation !== undefined
        && Object.keys(changed).every((key) => key === "rowPresentation" || key === "minimapOverview");
      if (presentationOnlyChange) renderer.updatePresentation(projection);
      else if (!transactionOnlyChange) renderer.update(projection);
      signalSplitRuntimeRef.current?.onDocumentChanged(result);
      setTimelineRange((range) => {
        const start = Math.min(range.start, result.snapshot.document.timeline.cycleCount - 1);
        const end = Math.max(start + 1, Math.min(range.end, result.snapshot.document.timeline.cycleCount));
        // Most property/style commits do not change the selected timeline
        // range. Preserve its identity so the range-selection effect does not
        // perform another DOM pass for an unchanged range.
        return range.start === start && range.end === end ? range : { start, end };
      });
      requestDiagnosticPublish();
      void renderer.whenIdle().then(() => {
        if (!active || !rendererHost.isConnected) return;
        // Accepted timeline-semantic changes must rebuild the ruler even after
        // its first paint.  The previous guard only refreshed during the
        // initialisation window, leaving Time Group collapse/expand controls
        // with the old ticks and aria-label until an unrelated render.
        if (refreshRuler) {
          timelineRuntime.refreshRuler();
          timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end);
        }
        if (refreshPlayheadNow) timelineRuntime.refreshPlayhead();
        if (refreshGridNow) timelineRuntime.refreshGrid();
        timelineRuntime.setZoom(timelineNavigation.getZoom());
        if (refreshOverlaysNow) timelineRuntime.refreshOverlays();
        markOpenPhase("visible-waveforms-ready");
        markOpenPhase("all-visible-idle");
        if (openingGenerationForCompletion !== undefined && primaryPresentationGeneration === openingGenerationForCompletion) primaryPresentationOpening = false;
        flushOpenDiagnosticPublish();
        collectWaveErrors();
        requestDiagnosticPublish();
        requestAnimationFrame(() => {
          if (!active || !rendererHost.isConnected || commandGeneration !== acceptedCommandGeneration) return;
          const idleAt = globalThis.performance.now();
          rendererHost.dataset.editorIdle = "true";
          rendererHost.dataset.acceptedCommandCount = String(Number(rendererHost.dataset.acceptedCommandCount ?? "0") + 1);
          rendererHost.dataset.lastApplyToIdleMs = String(Math.max(0, idleAt - context.commandStartedAt));
          rendererHost.dataset.lastDiagnosticsDurationMs = String(context.diagnosticsDurationMs ?? 0);
          const diagnosticPasses = Number(rendererHost.dataset.timingDiagnosticsFullPasses ?? "0") + (context.diagnosticsRecomputed ? 1 : 0);
          const diagnosticReuses = Number(rendererHost.dataset.timingDiagnosticsReuses ?? "0") + (context.diagnosticsRecomputed ? 0 : 1);
          rendererHost.dataset.timingDiagnosticsFullPasses = String(diagnosticPasses);
          rendererHost.dataset.timingDiagnosticsReuses = String(diagnosticReuses);
        });
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
      setPinnedSignalIds([]);
      resetInspectorAccordionState();
       interactionHandle?.cancel();
      arrowPicker.reset();
      delete rendererHost.dataset.arrowPick;
      delete rendererHost.dataset.editorIdle;
      delete rendererHost.dataset.cycleViewReady;
      setBottomPinned(false);
      setPinnedBottomSelection(undefined);
      resetForDocument(canonicalDocument.timeline.cycleCount);
      selection.clear();
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
      referenceGeometryReconciled = false;
      primaryPresentationOpening = true;
      const openingGeneration = ++primaryPresentationGeneration;
      rulerInitialized = false;
      // Open/New owns a deterministic viewport policy. Apply it before the
      // first projection so the previous document cannot seed stale rows.
      viewportElement.scrollLeft = 0;
      timelineScrollOwner(viewportElement).scrollLeft = 0;
      viewportElement.scrollTop = 0;
        window = buildViewportWindow(viewportElement, canonicalDocument.timeline.referenceClock, input.presentation.getPinnedSignalIds());
      projection = projectionCoordinator.project({ snapshot: sessionController.snapshot(), changeSet: { fullDocumentReplace: true }, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      // Match the initial-mount bootstrap: render just the stable geometry
      // owner first. Its geometry-ready callback reprojects this full
      // projection and queues the other visible signals once with final bounds.
      renderer.update(projectionForInitialWaveBootstrap(projection, initialWaveSignalIds(canonicalDocument)));
      signalSplitRuntimeRef.current?.onDocumentReplaced();
      markOpenPhase("canonical-replaced");
      markOpenPhase("renderer-updated");
      requestAnimationFrame(() => { if (active) markOpenPhase("row-shell-painted"); });
      rulerElement.replaceChildren();
      requestDiagnosticPublish();
      void renderer.whenIdle().then(() => {
        if (!active || !rendererHost.isConnected) return;
        // The reference-geometry callback may already have built the ruler
        // before reprojecting the remaining rows. Keep this post-idle pass as
        // a fallback for documents where no geometry callback initialized it.
        refreshRulerAndGridIfNeeded(() => rulerInitialized, () => timelineRuntime.refreshRuler(), () => timelineRuntime.refreshGrid());
        timelineRuntime.refreshPlayhead();
        timelineRuntime.setZoom(timelineNavigation.getZoom());
        timelineRuntime.refreshOverlays();
        markOpenPhase("visible-waveforms-ready");
        markOpenPhase("all-visible-idle");
        if (primaryPresentationGeneration === openingGeneration) primaryPresentationOpening = false;
        flushOpenDiagnosticPublish();
        collectWaveErrors();
        requestDiagnosticPublish();
      });
      },
    });

    const onViewportKeyDown = createTimelineViewportKeyDownHandler(viewportElement);
    const arrowPicker = new TransitionArrowPicker({
      rendererHost,
      geometry: timelineGeometry,
      getDocument: () => sessionController.snapshot().document,
      execute: (command) => application.execute(command),
      selectAnnotation: (id) => selection.selectAnnotation(id),
      publishState,
      setProblem,
      setStatus: setArrowPickStatus,
    });
    // #375: the picked-transitions workflow is shared by both line-shaped
    // types that need real geometry-anchored endpoints -- Arrow and
    // Dependency -- so it must produce whichever type the Annotation type
    // dropdown currently has selected, not a type hardcoded to "arrow".
    armArrowPick.current = arrowPicker.arm;
    const { onKeyDown: onTreeKeyDown, focusItem: focusTreeItem } = createTreeKeyboardController(rendererHost, treeFocusRowIdRef);
    const onSelect = (event: MouseEvent, options?: { readonly synchronous?: boolean }) => {
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
        if (!selection.refs.signalIds.current.has(signalId)) selection.selectSignal(signalId);
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
      if (arrowPicker.handleClick(event)) return;
      const annotationOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]") : null;
      if (annotationOwner?.dataset.annotationId) {
        const id = annotationOwner.dataset.annotationId as AnnotationId;
        selection.selectAnnotation(id, event.ctrlKey || event.metaKey);
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
      const id = target?.dataset.rowId;
      if (!id) return;
      const currentDocument = sessionController.snapshot().document;
      const sourceIndex = getRowLayoutSourceIndex(currentDocument).index;
      const spacer = sourceIndex.spacersById.get(id as SpacerId);
      const spacerGroup = spacer ? currentDocument.signalGroups.find((group) => group.spacers?.some((item) => item.id === spacer.id)) : undefined;
      if (spacerGroup) {
        selection.selectSpacer(spacerGroup.id, id as SpacerId);
        focusTreeItem(target);
        return;
      }
      const signal = sourceIndex.signalsById.get(id);
      if (!signal) return;
      const commitSelection = () => selection.selectSignal(signal.id, event.ctrlKey || event.metaKey);
      if (options?.synchronous === true) flushSync(commitSelection); else startTransition(commitSelection);
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
      getPendingArrow: () => arrowPicker.pending,
      clearPendingArrow: arrowPicker.clear,
      applyCanvasCycleSelection,
      onSelect,
      onTreeKeyDown,
      onScroll: () => {
        // Keep the sticky ruler in the same scroll transaction as the
        // scrollable overlay surface. The runtime render path is intentionally
        // coalesced, but ruler alignment must be immediate for pointer/test
        // observers that sample geometry in the same task.
        syncRulerScroll(rulerElement, viewportElement, timelineGeometry.timeAxisMetrics.zoom);
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
      adapter.disposeAll();
    };
    },
  };
}
