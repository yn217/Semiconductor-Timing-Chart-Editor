import type { CanonicalDocument } from "./types.js";

export type CanonicalReferenceTarget = "signal" | "time-group" | "group" | "spacer" | "bookmark" | "enum";

export type CanonicalReferenceKind =
  | "signal.enum"
  | "timeline.referenceClock"
  | "timeGroup.parent"
  | "signal.edgeCounter.marker"
  | "annotation.anchor"
  | "annotation.ghostTraceSource"
  | "annotation.markerSpanStart"
  | "annotation.markerSpanEnd"
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

type CanonicalReferenceIndex = Readonly<{
  byTarget: ReadonlyMap<CanonicalReferenceTarget, ReadonlyMap<string, readonly CanonicalReference[]>>;
  order: ReadonlyMap<CanonicalReference, number>;
}>;

export interface CanonicalReferenceMetrics {
  readonly indexBuilds: number;
  readonly canonicalReferenceScans: number;
  readonly canonicalReferencesEnumerated: number;
  readonly targetQueries: number;
  readonly referencesVisited: number;
  readonly affectedSignalCount: number;
}

const referenceMetrics = {
  indexBuilds: 0,
  canonicalReferenceScans: 0,
  canonicalReferencesEnumerated: 0,
  targetQueries: 0,
  referencesVisited: 0,
  affectedSignalCount: 0,
};

export function getCanonicalReferenceMetrics(): CanonicalReferenceMetrics {
  return Object.freeze({ ...referenceMetrics });
}

export function resetCanonicalReferenceMetrics(): void {
  referenceMetrics.indexBuilds = 0;
  referenceMetrics.canonicalReferenceScans = 0;
  referenceMetrics.canonicalReferencesEnumerated = 0;
  referenceMetrics.targetQueries = 0;
  referenceMetrics.referencesVisited = 0;
  referenceMetrics.affectedSignalCount = 0;
}

// Reference results are owned by these immutable collections, not by the root
// document wrapper. The document ID is stored at the leaf because it supplies
// the owner ID of the timeline.referenceClock record; other document metadata
// does not invalidate the index. Weak keys bound cache lifetime to its owners.
type ReferenceIndexCacheEntry = Readonly<{ documentId: string; index: CanonicalReferenceIndex }>;
type ReferenceIndexCacheNode = WeakMap<object, ReferenceIndexCacheNode | ReferenceIndexCacheEntry>;
const referenceIndexes: ReferenceIndexCacheNode = new WeakMap();

/**
 * Enumerates the currently supported canonical stable-ID relationships.
 * Consumers use this registry instead of rediscovering cross-references from
 * individual object shapes.
 */
export function canonicalReferences(document: CanonicalDocument): readonly CanonicalReference[] {
  referenceMetrics.canonicalReferenceScans += 1;
  const references: CanonicalReference[] = [];
  document.signals.forEach((signal, index) => {
    if (signal.type !== "clock" && signal.type !== "commentRow" && signal.enumId !== undefined) references.push({ kind: "signal.enum", ownerId: signal.id, targetId: signal.enumId, targetType: "enum", path: `$.signals[${index}].enumId` });
  });
  document.timeGroups.forEach((group, index) => {
    if (group.parentId !== undefined) references.push({ kind: "timeGroup.parent", ownerId: group.id, targetId: group.parentId, targetType: "time-group", path: `$.timeGroups[${index}].parentId` });
  });
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
    if (annotation.type === "marker") {
      if (annotation.verticalSpan?.startRowId !== undefined) references.push({ kind: "annotation.markerSpanStart", ownerId: annotation.id, targetId: annotation.verticalSpan.startRowId, targetType: "signal", path: `$.annotations[${index}].verticalSpan.startRowId` });
      if (annotation.verticalSpan?.endRowId !== undefined) references.push({ kind: "annotation.markerSpanEnd", ownerId: annotation.id, targetId: annotation.verticalSpan.endRowId, targetType: "signal", path: `$.annotations[${index}].verticalSpan.endRowId` });
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
  referenceMetrics.canonicalReferencesEnumerated += references.length;
  return references;
}

function canonicalReferenceIndex(document: CanonicalDocument): CanonicalReferenceIndex {
  const owners: readonly object[] = [
    document.signals,
    document.timeGroups,
    document.annotations,
    document.transactions,
    document.timeline,
    document.signalGroups,
  ];
  let node = referenceIndexes;
  for (const owner of owners.slice(0, -1)) {
    const cached = node.get(owner);
    if (cached instanceof WeakMap) node = cached;
    else {
      const child: ReferenceIndexCacheNode = new WeakMap();
      node.set(owner, child);
      node = child;
    }
  }
  const leafOwner = owners[owners.length - 1]!;
  const cached = node.get(leafOwner);
  if (cached !== undefined && !(cached instanceof WeakMap) && cached.documentId === document.document.id) return cached.index;

  const mutable = new Map<CanonicalReferenceTarget, Map<string, CanonicalReference[]>>();
  const orderedReferences = canonicalReferences(document);
  const order = new Map<CanonicalReference, number>();
  referenceMetrics.indexBuilds += 1;
  for (const [index, reference] of orderedReferences.entries()) {
    order.set(reference, index);
    let byId = mutable.get(reference.targetType);
    if (byId === undefined) {
      byId = new Map();
      mutable.set(reference.targetType, byId);
    }
    const bucket = byId.get(reference.targetId);
    if (bucket === undefined) byId.set(reference.targetId, [reference]);
    else bucket.push(reference);
  }

  for (const byId of mutable.values()) {
    for (const bucket of byId.values()) Object.freeze(bucket);
  }
  const index: CanonicalReferenceIndex = { byTarget: mutable, order };
  node.set(leafOwner, { documentId: document.document.id, index });
  return index;
}

export function referencesTo(document: CanonicalDocument, targetType: CanonicalReferenceTarget, targetId: string): readonly CanonicalReference[] {
  return referencesToTargets(document, targetType, [targetId]);
}

/** Query several target buckets from one immutable reference index lookup. */
export function referencesToTargets(
  document: CanonicalDocument,
  targetType: CanonicalReferenceTarget,
  targetIds: Iterable<string>,
): readonly CanonicalReference[] {
  const uniqueTargetIds = [...new Set(targetIds)];
  referenceMetrics.targetQueries += 1;
  if (targetType === "signal") referenceMetrics.affectedSignalCount += uniqueTargetIds.length;
  if (uniqueTargetIds.length === 0) return EMPTY_REFERENCES;

  const index = canonicalReferenceIndex(document);
  const byId = index.byTarget.get(targetType);
  if (uniqueTargetIds.length === 1) {
    const bucket = byId?.get(uniqueTargetIds[0]!) ?? EMPTY_REFERENCES;
    referenceMetrics.referencesVisited += bucket.length;
    return bucket;
  }
  const references: CanonicalReference[] = [];
  for (const targetId of uniqueTargetIds) {
    const bucket = byId?.get(targetId);
    if (bucket !== undefined) references.push(...bucket);
  }
  references.sort((left, right) => index.order.get(left)! - index.order.get(right)!);
  referenceMetrics.referencesVisited += references.length;
  return references.length === 0 ? EMPTY_REFERENCES : Object.freeze(references);
}

const EMPTY_REFERENCES: readonly CanonicalReference[] = Object.freeze([]);

export function referencesToSignal(document: CanonicalDocument, signalId: string): readonly CanonicalReference[] {
  return referencesTo(document, "signal", signalId);
}

export function referencesToTimeGroup(document: CanonicalDocument, timeGroupId: string): readonly CanonicalReference[] {
  return referencesTo(document, "time-group", timeGroupId);
}
