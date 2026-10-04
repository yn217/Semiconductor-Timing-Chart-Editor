import type { ChangeSet } from "@timing-chart-v2/commands";
import type { SignalId } from "@timing-chart-v2/schema";

export interface RenderInvalidation {
  readonly snapDependenciesChanged: boolean;
  readonly referenceWaveChanged: boolean;
  readonly refreshRuler: boolean;
  readonly refreshGrid: boolean;
  readonly refreshOverlays: boolean;
}

export function deriveRenderInvalidation(changeSet: ChangeSet, referenceSignalId: SignalId | undefined): RenderInvalidation {
  const full = changeSet.fullDocumentReplace === true;
  const snapDependenciesChanged = full || changeSet.rowOrder !== undefined || changeSet.addedSignals !== undefined || changeSet.removedSignals !== undefined || changeSet.addedGroups !== undefined || changeSet.removedGroups !== undefined || changeSet.waveSemantics !== undefined || changeSet.geometryLocal !== undefined || changeSet.geometryScreenX === true || changeSet.geometryScreenY !== undefined || changeSet.annotationPosition !== undefined || changeSet.annotationStyle !== undefined || changeSet.bookmarkPosition !== undefined || changeSet.timeGroupSemantics !== undefined || changeSet.timelineSemantics === true;
  const referenceWaveChanged = referenceSignalId !== undefined && (full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || changeSet.waveSemantics?.includes(referenceSignalId) === true || changeSet.geometryLocal?.includes(referenceSignalId) === true);
  const refreshRuler = full || changeSet.timelineSemantics === true || changeSet.transactionTimeScale === true || changeSet.timeGroupSemantics !== undefined || changeSet.bookmarkPosition !== undefined || referenceWaveChanged;
  const refreshGrid = full || changeSet.timelineSemantics === true || changeSet.transactionTimeScale === true || changeSet.timeGroupSemantics !== undefined || referenceWaveChanged;
  // Row presentation also covers label-only edits such as Signal rename.
  // Operations that actually move/hide rows carry geometryScreenY and/or
  // annotationPosition explicitly, so those remain overlay invalidations.
  const refreshOverlays = refreshRuler || changeSet.rowOrder !== undefined || changeSet.geometryScreenY !== undefined || changeSet.edgeCounter !== undefined || (changeSet.annotationPosition?.length ?? 0) > 0 || (changeSet.annotationStyle?.length ?? 0) > 0 || (changeSet.annotationOrder?.length ?? 0) > 0 || (changeSet.annotationGroups?.length ?? 0) > 0 || (changeSet.addedSignals?.length ?? 0) > 0 || (changeSet.removedSignals?.length ?? 0) > 0;
  return { snapDependenciesChanged, referenceWaveChanged, refreshRuler, refreshGrid, refreshOverlays };
}

/** The renderer may patch these stable-ID owners without reconciling the full overlay set. */
export function annotationStylePatchIds(changeSet: ChangeSet): readonly string[] | undefined {
  const ids = changeSet.annotationStyle;
  if (!ids?.length || changeSet.annotationPosition !== undefined) return undefined;
  return Object.keys(changeSet).every((key) => key === "annotationStyle" || key === "minimapOverview" || key === "timingDiagnosticsUnchanged")
    ? ids
    : undefined;
}
