import type { Annotation, CanonicalDocument } from "./types.js";

export type CanonicalReferenceTarget = "signal" | "time-group" | "group" | "transaction-group" | "spacer" | "bookmark" | "enum" | "annotation" | "label-anchor";

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
  | "transaction.group"
  | "annotationGroup.member"
  | "timeGroup.resumeLabelAnchor"
  | "constraint.handshakeRequest"
  | "constraint.handshakeAcknowledge"
  | "constraint.handshakeStableSignal"
  | "constraint.handshakeReset"
  | "constraint.latencyRangeRequest"
  | "constraint.latencyRangeAcknowledge"
  | "constraint.latencyTrigger"
  | "constraint.latencyResponse"
  | "constraint.setupHoldData"
  | "constraint.setupHoldCapture"
  | "labelAnchor.ownerTimeGroup"
  | "signalGroup.row"
  | "spacer.ownerGroup";

export const CANONICAL_REFERENCE_KINDS = Object.freeze([
  "signal.enum", "timeline.referenceClock", "timeGroup.parent", "signal.edgeCounter.marker",
  "annotation.anchor", "annotation.ghostTraceSource", "annotation.markerSpanStart", "annotation.markerSpanEnd",
  "transaction.linkedSignal", "transaction.group", "annotationGroup.member", "timeGroup.resumeLabelAnchor",
  "constraint.handshakeRequest", "constraint.handshakeAcknowledge", "constraint.handshakeStableSignal", "constraint.handshakeReset",
  "constraint.latencyRangeRequest", "constraint.latencyRangeAcknowledge", "constraint.latencyTrigger", "constraint.latencyResponse", "constraint.setupHoldData", "constraint.setupHoldCapture",
  "labelAnchor.ownerTimeGroup", "signalGroup.row", "spacer.ownerGroup",
] as const satisfies readonly CanonicalReferenceKind[]);

/** Stable-ID schema fields that are intentionally enumerated by this registry. */
export const CANONICAL_REFERENCE_SCHEMA_PATHS = Object.freeze([
  "$.timeline.referenceClock",
  "$.timeline.labelAnchors[*].ownerTimeGroupId",
  "$.signalGroups[*].rows[*]",
  "$.signals[*].edgeCounter.anchorId",
  "$.signals[*].enumId",
  "$.timeGroups[*].parentId",
  "$.timeGroups[*].presentation.resumeLabelAnchorId",
  "$.annotations[*].anchor.signalId",
  "$.annotations[*].start.signalId",
  "$.annotations[*].end.signalId",
  "$.annotations[*].from.signalId",
  "$.annotations[*].to.signalId",
  "$.annotations[*].sourceSignalId",
  "$.annotations[*].verticalSpan.startRowId",
  "$.annotations[*].verticalSpan.endRowId",
  "$.annotationGroups[*].annotationIds[*]",
  "$.transactions[*].groupId",
  "$.transactions[*].linkedSignals[*]",
] as const);

export interface CanonicalReference {
  readonly kind: CanonicalReferenceKind;
  readonly ownerId: string;
  readonly targetId: string;
  readonly targetType: CanonicalReferenceTarget;
  readonly path: string;
}

type CanonicalReferenceIndex = Readonly<{
  byTarget: ReadonlyMap<CanonicalReferenceTarget, ReadonlyMap<string, readonly CanonicalReference[]>>;
  byOwner: ReadonlyMap<string, readonly CanonicalReference[]>;
  annotationById: ReadonlyMap<string, Annotation>;
  annotationOrderById: ReadonlyMap<string, number>;
}>;

// Reference results are owned by these immutable collections, not by the root
// document wrapper. The document ID is stored at the leaf because it supplies
// the owner ID of the timeline.referenceClock record; other document metadata
// does not invalidate the index. Weak keys bound cache lifetime to its owners.
type ReferenceIndexCacheEntry = Readonly<{ documentId: string; index: CanonicalReferenceIndex }>;
type ReferenceIndexCacheNode = WeakMap<object, ReferenceIndexCacheNode | ReferenceIndexCacheEntry>;
const referenceIndexes: ReferenceIndexCacheNode = new WeakMap();
const EMPTY_REFERENCE_OWNERS: readonly object[] = Object.freeze([]);
const referenceMetrics = { indexBuilds: 0, referencesEnumerated: 0, targetQueries: 0, referencesVisited: 0 };

export function canonicalReferenceMetrics(): Readonly<typeof referenceMetrics> {
  return Object.freeze({ ...referenceMetrics });
}

/** Enumerates only the explicitly supported stable-ID fields in typed constraint payloads. */
export function constraintReferences(constraints: CanonicalDocument["constraints"]): readonly CanonicalReference[] {
  const references: CanonicalReference[] = [];
  constraints.forEach((constraint, index) => {
    const data = constraint.data;
    if (data === undefined) return;
    const scalar = (keys: readonly string[]): { key: string; value: string } | undefined => {
      for (const key of keys) if (typeof data[key] === "string" && (data[key] as string).trim().length > 0) return { key, value: (data[key] as string).trim() };
      return undefined;
    };
    const list = (keys: readonly string[]): { key: string; values: readonly string[] } | undefined => {
      for (const key of keys) {
        const value = data[key];
        if (Array.isArray(value)) return { key, values: value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) };
      }
      return undefined;
    };
    const push = (kind: CanonicalReferenceKind, field: { key: string; value: string } | undefined): void => {
      if (field !== undefined) references.push({ kind, ownerId: constraint.id, targetId: field.value, targetType: "signal", path: `$.constraints[${index}].data.${field.key}` });
    };
    switch (constraint.type.toLowerCase()) {
      case "handshake":
        push("constraint.handshakeRequest", scalar(["requestSignalId", "request", "reqSignalId", "req"]));
        push("constraint.handshakeAcknowledge", scalar(["acknowledgeSignalId", "ackSignalId", "acknowledge", "ack"]));
        push("constraint.handshakeReset", scalar(["resetSignalId"]));
        {
          const stable = list(["stableSignalIds", "dataSignalIds", "stableSignals", "dataSignals"]);
          stable?.values.forEach((value, itemIndex) => references.push({ kind: "constraint.handshakeStableSignal", ownerId: constraint.id, targetId: value, targetType: "signal", path: `$.constraints[${index}].data.${stable.key}[${itemIndex}]` }));
        }
        break;
      case "latency-range":
        push("constraint.latencyRangeRequest", scalar(["requestSignalId"]));
        push("constraint.latencyRangeAcknowledge", scalar(["acknowledgeSignalId"]));
        break;
      case "latency":
        push("constraint.latencyTrigger", scalar(["triggerSignalId"]));
        push("constraint.latencyResponse", scalar(["responseSignalId"]));
        break;
      case "setup": case "hold":
        push("constraint.setupHoldData", scalar(["dataSignalId"]));
        push("constraint.setupHoldCapture", scalar(["captureSignalId"]));
        break;
    }
  });
  return references;
}

/**
 * Enumerates the currently supported canonical stable-ID relationships.
 * Consumers use this registry instead of rediscovering cross-references from
 * individual object shapes.
 */
export function canonicalReferences(document: CanonicalDocument): readonly CanonicalReference[] {
  const references: CanonicalReference[] = [];
  document.signals.forEach((signal, index) => {
    if (signal.type !== "clock" && signal.type !== "commentRow" && signal.enumId !== undefined) references.push({ kind: "signal.enum", ownerId: signal.id, targetId: signal.enumId, targetType: "enum", path: `$.signals[${index}].enumId` });
  });
  document.timeGroups.forEach((group, index) => {
    if (group.parentId !== undefined) references.push({ kind: "timeGroup.parent", ownerId: group.id, targetId: group.parentId, targetType: "time-group", path: `$.timeGroups[${index}].parentId` });
    const resumeId = group.presentation?.resumeLabelAnchorId;
    if (resumeId !== undefined) references.push({ kind: "timeGroup.resumeLabelAnchor", ownerId: group.id, targetId: resumeId, targetType: "label-anchor", path: `$.timeGroups[${index}].presentation.resumeLabelAnchorId` });
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
    if (transaction.groupId !== undefined) references.push({ kind: "transaction.group", ownerId: transaction.id, targetId: transaction.groupId, targetType: "transaction-group", path: `$.transactions[${index}].groupId` });
    transaction.linkedSignals?.forEach((signalId, signalIndex) => references.push({
      kind: "transaction.linkedSignal",
      ownerId: transaction.id,
      targetId: signalId,
      targetType: "signal",
      path: `$.transactions[${index}].linkedSignals[${signalIndex}]`,
    }));
  });
  document.annotationGroups?.forEach((group, groupIndex) => group.annotationIds.forEach((annotationId, memberIndex) => references.push({
    kind: "annotationGroup.member",
    ownerId: group.id,
    targetId: annotationId,
    targetType: "annotation",
    path: `$.annotationGroups[${groupIndex}].annotationIds[${memberIndex}]`,
  })));
  references.push(...constraintReferences(document.constraints));
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

function canonicalReferenceIndex(document: CanonicalDocument): CanonicalReferenceIndex {
  const owners: readonly object[] = [
    document.signals,
    document.timeGroups,
    document.annotations,
    document.transactions,
    document.timeline,
    document.signalGroups,
    document.annotationGroups,
    document.constraints,
    document.transactionGroups ?? EMPTY_REFERENCE_OWNERS,
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
  const byOwner = new Map<string, CanonicalReference[]>();
  const references = canonicalReferences(document);
  referenceMetrics.indexBuilds += 1;
  referenceMetrics.referencesEnumerated += references.length;
  for (const reference of references) {
    const ownerReferences = byOwner.get(reference.ownerId);
    if (ownerReferences === undefined) byOwner.set(reference.ownerId, [reference]);
    else ownerReferences.push(reference);
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
  for (const bucket of byOwner.values()) Object.freeze(bucket);
  const annotationById = new Map(document.annotations.map((annotation) => [annotation.id, annotation]));
  const annotationOrderById = new Map(document.annotations.map((annotation, index) => [annotation.id, index]));
  const index: CanonicalReferenceIndex = { byTarget: mutable, byOwner, annotationById, annotationOrderById };
  node.set(leafOwner, { documentId: document.document.id, index });
  return index;
}

export function referencesTo(document: CanonicalDocument, targetType: CanonicalReferenceTarget, targetId: string): readonly CanonicalReference[] {
  referenceMetrics.targetQueries += 1;
  const references = canonicalReferenceIndex(document).byTarget.get(targetType)?.get(targetId) ?? EMPTY_REFERENCES;
  referenceMetrics.referencesVisited += references.length;
  return references;
}

/** Returns references for a set of targets without enumerating unrelated owners. */
export function referencesToAny(
  document: CanonicalDocument,
  targetType: CanonicalReferenceTarget,
  targetIds: Iterable<string>,
): readonly CanonicalReference[] {
  const index = canonicalReferenceIndex(document);
  referenceMetrics.targetQueries += 1;
  const byId = index.byTarget.get(targetType);
  if (byId === undefined) return EMPTY_REFERENCES;
  const references: CanonicalReference[] = [];
  const seenTargets = new Set<string>();
  for (const targetId of targetIds) {
    if (seenTargets.has(targetId)) continue;
    seenTargets.add(targetId);
    const bucket = byId.get(targetId);
    if (bucket === undefined) continue;
    referenceMetrics.referencesVisited += bucket.length;
    references.push(...bucket);
  }
  return references.length === 0 ? EMPTY_REFERENCES : references;
}

/** Resolves annotation-owned references through the same immutable snapshot index. */
export function annotationsForReferences(
  document: CanonicalDocument,
  references: Iterable<CanonicalReference>,
): readonly Annotation[] {
  const index = canonicalReferenceIndex(document);
  const annotationIds = new Set<string>();
  for (const reference of references) {
    if (index.annotationById.has(reference.ownerId)) annotationIds.add(reference.ownerId);
  }
  return [...annotationIds]
    .sort((left, right) => index.annotationOrderById.get(left)! - index.annotationOrderById.get(right)!)
    .map((annotationId) => index.annotationById.get(annotationId)!);
}

const EMPTY_REFERENCES: readonly CanonicalReference[] = Object.freeze([]);

export function referencesToSignal(document: CanonicalDocument, signalId: string): readonly CanonicalReference[] {
  return referencesTo(document, "signal", signalId);
}

export function referencesToTimeGroup(document: CanonicalDocument, timeGroupId: string): readonly CanonicalReference[] {
  return referencesTo(document, "time-group", timeGroupId);
}

export function referencesFromOwner(document: CanonicalDocument, ownerId: string): readonly CanonicalReference[] {
  return canonicalReferenceIndex(document).byOwner.get(ownerId) ?? EMPTY_REFERENCES;
}
