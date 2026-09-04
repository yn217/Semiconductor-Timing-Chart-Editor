import type { CanonicalDocument } from "./types.js";

export type CanonicalReferenceTarget = "signal" | "time-group" | "group" | "spacer" | "bookmark";

export type CanonicalReferenceKind =
  | "timeline.referenceClock"
  | "signal.edgeCounter.marker"
  | "annotation.anchor"
  | "annotation.ghostTraceSource"
  | "transaction.linkedSignal"
  | "labelAnchor.ownerTimeGroup"
  | "signalGroup.row"
  | "spacer.ownerGroup";

export interface CanonicalReference {
  readonly kind: CanonicalReferenceKind;
  readonly ownerId: string;
  readonly targetId: string;
  readonly targetType: CanonicalReferenceTarget;
  readonly path: string;
}

/**
 * Enumerates the currently supported canonical stable-ID relationships.
 * Consumers use this registry instead of rediscovering cross-references from
 * individual object shapes.
 */
export function canonicalReferences(document: CanonicalDocument): readonly CanonicalReference[] {
  const references: CanonicalReference[] = [];
  const signalIds = new Set<string>(document.signals.map((signal) => signal.id));
  const spacerIds = new Set<string>(document.signalGroups.flatMap((group) => (group.spacers ?? []).map((spacer) => spacer.id)));
  if (document.timeline.referenceClock !== undefined) {
    references.push({
      kind: "timeline.referenceClock",
      ownerId: document.document.id,
      targetId: document.timeline.referenceClock,
      targetType: "signal",
      path: "$.timeline.referenceClock",
    });
  }
  document.signals.forEach((signal, index) => {
    if (signal.type !== "clock" || signal.edgeCounter.countFrom !== "marker" || signal.edgeCounter.anchorId === undefined) return;
    references.push({
      kind: "signal.edgeCounter.marker",
      ownerId: signal.id,
      targetId: signal.edgeCounter.anchorId,
      targetType: "bookmark",
      path: `$.signals[${index}].edgeCounter.anchorId`,
    });
  });
  document.annotations.forEach((annotation, index) => {
    for (const field of ["anchor", "start", "end", "from", "to"] as const) {
      const signalId = annotation[field]?.signalId;
      if (signalId !== undefined) {
        references.push({
          kind: "annotation.anchor",
          ownerId: annotation.id,
          targetId: signalId,
          targetType: "signal",
          path: `$.annotations[${index}].${field}.signalId`,
        });
      }
    }
    if (annotation.sourceSignalId !== undefined) {
      references.push({
        kind: "annotation.ghostTraceSource",
        ownerId: annotation.id,
        targetId: annotation.sourceSignalId,
        targetType: "signal",
        path: `$.annotations[${index}].sourceSignalId`,
      });
    }
  });
  document.transactions.forEach((transaction, index) => {
    transaction.linkedSignals?.forEach((signalId, signalIndex) => references.push({
      kind: "transaction.linkedSignal",
      ownerId: transaction.id,
      targetId: signalId,
      targetType: "signal",
      path: `$.transactions[${index}].linkedSignals[${signalIndex}]`,
    }));
  });
  document.timeline.labelAnchors.forEach((anchor, index) => {
    if (anchor.ownerTimeGroupId !== undefined) {
      references.push({
        kind: "labelAnchor.ownerTimeGroup",
        ownerId: anchor.id,
        targetId: anchor.ownerTimeGroupId,
        targetType: "time-group",
        path: `$.timeline.labelAnchors[${index}].ownerTimeGroupId`,
      });
    }
  });
  document.signalGroups.forEach((group, groupIndex) => {
    group.rows.forEach((rowId, rowIndex) => {
      const targetType = signalIds.has(rowId) ? "signal"
        : spacerIds.has(rowId) ? "spacer" : undefined;
      if (targetType === undefined) return;
      references.push({
        kind: "signalGroup.row",
        ownerId: group.id,
        targetId: rowId,
        targetType,
        path: `$.signalGroups[${groupIndex}].rows[${rowIndex}]`,
      });
    });
    group.spacers?.forEach((spacer, spacerIndex) => references.push({
      kind: "spacer.ownerGroup",
      ownerId: spacer.id,
      targetId: group.id,
      targetType: "group",
      path: `$.signalGroups[${groupIndex}].spacers[${spacerIndex}]`,
    }));
  });
  return references;
}

export function referencesTo(document: CanonicalDocument, targetType: CanonicalReferenceTarget, targetId: string): readonly CanonicalReference[] {
  return canonicalReferences(document).filter((reference) => reference.targetType === targetType && reference.targetId === targetId);
}

export function referencesToSignal(document: CanonicalDocument, signalId: string): readonly CanonicalReference[] {
  return referencesTo(document, "signal", signalId);
}

export function referencesToTimeGroup(document: CanonicalDocument, timeGroupId: string): readonly CanonicalReference[] {
  return referencesTo(document, "time-group", timeGroupId);
}
