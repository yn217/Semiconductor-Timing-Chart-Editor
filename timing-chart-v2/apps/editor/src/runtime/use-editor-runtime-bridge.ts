import type { ChangeSet } from "@timing-chart-v2/commands";
import { EditorApplicationRuntime } from "./editor-application-runtime.js";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import type { ImmutableSnapIndex, LocalGeometryMap, ScreenGeometryProjector, SemanticSnapCandidateService } from "@timing-chart-v2/geometry";
import { DisplayTimeMappingCache, type DisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
import { createTimelineViewportRuntime, type TimelineViewportRuntime } from "./timeline-viewport-runtime.js";

/**
 * Compatibility barrel for the application runtime boundary.
 *
 * Concrete lifecycle responsibilities live in the owner modules below. New
 * runtime code should import the narrow owner directly; this barrel remains
 * for the existing application wiring while the migration is incremental.
 */
export { applyRendererHostSizing, refreshRulerRangeSelection, refreshTransactionLinkedRows, attachDirtyUnloadGuard, attachDialogOriginCapture, scheduleDialogFocusRestore, trapDialogTab, type RendererHostSizingContext } from "./editor-dom-bridge.js";
export { mountInitialTimelineProjection, projectViewportWindow } from "./viewport-projection.js";
export { createWaveformSurfaceProvider, type WaveformProviderContext } from "./waveform-surface-provider.js";
export { refreshGridPresentation, refreshPlayheadPresentation, refreshRangeBandPresentation, refreshTimelinePresentation, rebuildRulerPresentation, syncFrozenColumnScroll, syncPresentationScale, syncRulerScroll } from "./timeline-presentation-refresh.js";
export { publishRendererState, collectWaveRenderErrors, createOpenPhaseTracker, type OpenPhaseTracker } from "./runtime-diagnostics.js";
export { refreshGroupStylePreview, refreshAnnotationPreview, refreshClockPreview } from "./presentation-preview.js";
export { createTimelineNavigationController, createTimelineZoomController, applyTimelineZoom, type TimelineZoomSurfaceContext } from "./viewport-controller.js";
export { attachEditorEventBindings, attachMenuKeyboardNavigation, resolveTransactionSnapCycle, type EditorEventBinding } from "./interaction-controller.js";
export { scheduleInitialTimelineRefresh } from "./document-lifecycle-controller.js";
export { refreshRendererEdgeCounters, refreshRendererForReason, refreshRendererOverlays } from "./render-coordinator.js";

export function createEditorRuntimeBridge(initialDocument: Readonly<CanonicalDocument>): EditorApplicationRuntime {
  return new EditorApplicationRuntime(initialDocument);
}

export type SnapIndexResolver = (() => ImmutableSnapIndex) & { invalidate: () => void };

export function createSnapIndexResolver(context: {
  readonly getDocument: () => CanonicalDocument;
  readonly getProjection: () => RenderProjection;
  readonly geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>;
  readonly mappingCache: Pick<DisplayTimeMappingCache, "get">;
  readonly snapService: SemanticSnapCandidateService;
  readonly screenGeometry: ScreenGeometryProjector;
  readonly build: (document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, snapService: SemanticSnapCandidateService, screenGeometry: ScreenGeometryProjector) => ImmutableSnapIndex;
  readonly onBuilt: () => void;
}): SnapIndexResolver {
  let index: ImmutableSnapIndex | undefined;
  const resolver = (() => {
    if (!index) {
      const document = context.getDocument();
      index = context.build(document, context.getProjection(), context.geometryMaps, context.mappingCache.get(document.timeline, document.timeGroups), context.snapService, context.screenGeometry);
      context.onBuilt();
    }
    return index;
  }) as SnapIndexResolver;
  resolver.invalidate = () => { index = undefined; };
  return resolver;
}

export function deriveRenderInvalidation(changeSet: ChangeSet, referenceSignalId: SignalId | undefined): Readonly<{ snapDependenciesChanged: boolean; referenceWaveChanged: boolean; refreshRuler: boolean; refreshGrid: boolean; refreshOverlays: boolean }> {
  const full = changeSet.fullDocumentReplace === true;
  const snapDependenciesChanged = full || changeSet.rowOrder !== undefined || changeSet.addedSignals !== undefined || changeSet.removedSignals !== undefined || changeSet.addedGroups !== undefined || changeSet.removedGroups !== undefined || changeSet.waveSemantics !== undefined || changeSet.geometryLocal !== undefined || changeSet.geometryScreenX === true || changeSet.geometryScreenY !== undefined || changeSet.annotationPosition !== undefined || changeSet.annotationStyle !== undefined || changeSet.bookmarkPosition !== undefined || changeSet.timeGroupSemantics !== undefined || changeSet.timelineSemantics === true;
  const referenceWaveChanged = referenceSignalId !== undefined && (full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || changeSet.waveSemantics?.includes(referenceSignalId) === true || changeSet.geometryLocal?.includes(referenceSignalId) === true);
  const refreshRuler = full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || changeSet.bookmarkPosition !== undefined || referenceWaveChanged;
  const refreshGrid = full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || referenceWaveChanged;
  const refreshOverlays = refreshRuler || changeSet.rowOrder !== undefined || changeSet.geometryScreenY !== undefined || changeSet.edgeCounter !== undefined || (changeSet.annotationPosition?.length ?? 0) > 0 || (changeSet.annotationStyle?.length ?? 0) > 0 || (changeSet.annotationOrder?.length ?? 0) > 0 || (changeSet.annotationGroups?.length ?? 0) > 0 || (changeSet.addedSignals?.length ?? 0) > 0 || (changeSet.removedSignals?.length ?? 0) > 0;
  return { snapDependenciesChanged, referenceWaveChanged, refreshRuler, refreshGrid, refreshOverlays };
}

export function createEditorTimelineRuntime(context: Parameters<typeof createTimelineViewportRuntime>[0]): TimelineViewportRuntime {
  return createTimelineViewportRuntime(context);
}
