import type { CanonicalDocument } from "./types.js";

export type CanonicalReferenceTarget = "signal" | "time-group";

export type CanonicalReferenceKind =
  | "timeline.referenceClock"
  | "annotation.anchor"
  | "annotation.ghostTraceSource"
  | "transaction.linkedSignal"
  | "labelAnchor.ownerTimeGroup";

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
  if (document.timeline.referenceClock !== undefined) {
    references.push({
      kind: "timeline.referenceClock",
      ownerId: document.document.id,
      targetId: document.timeline.referenceClock,
      targetType: "signal",
      path: "$.timeline.referenceClock",
    });
  }
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
