import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { annotationsForReferences, CANONICAL_REFERENCE_KINDS, CANONICAL_REFERENCE_SCHEMA_PATHS, canonicalReferenceMetrics, canonicalReferences, referencesFromOwner, referencesTo, referencesToAny, referencesToSignal, referencesToTimeGroup, validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { AnnotationGroupId, AnnotationId, BookmarkId, CanonicalDocument, ConstraintId, LabelAnchorId, SignalId, TimeGroupId, TransactionGroupId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

type SchemaNode = { $ref?: string; properties?: Record<string, SchemaNode>; items?: SchemaNode; allOf?: SchemaNode[]; oneOf?: SchemaNode[]; anyOf?: SchemaNode[] };

function stableIdReferencePaths(schema: SchemaNode & { $defs?: Record<string, SchemaNode> }): string[] {
  const paths: string[] = [];
  const walk = (node: SchemaNode, path: string, seen: ReadonlySet<string>): void => {
    if (node.$ref !== undefined) {
      if (node.$ref === "#/$defs/stableId") {
        if (!path.endsWith(".id")) paths.push(path);
        return;
      }
      const definition = node.$ref.split("/").at(-1)!;
      if (seen.has(definition)) return;
      const resolved = schema.$defs?.[definition];
      if (resolved) walk(resolved, path, new Set([...seen, definition]));
      return;
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) walk(child, `${path}.${key}`, seen);
    if (node.items) walk(node.items, `${path}[*]`, seen);
    for (const child of [...(node.allOf ?? []), ...(node.oneOf ?? []), ...(node.anyOf ?? [])]) walk(child, path, seen);
  };
  walk(schema, "$", new Set());
  return paths.sort();
}

describe("canonical stable-ID reference registry", () => {
  it("mechanically covers every stableId reference field declared by the canonical JSON schema", () => {
    const schema = JSON.parse(readFileSync(new URL("../../packages/schema/src/canonical-document.schema.json", import.meta.url), "utf8")) as SchemaNode & { $defs?: Record<string, SchemaNode> };
    expect([...CANONICAL_REFERENCE_SCHEMA_PATHS].sort()).toEqual(stableIdReferencePaths(schema));
  });

  it("queries multiple target buckets once and resolves annotation owners without scanning canonical annotations", () => {
    const base = canonicalFixture();
    const first = base.signals[0]!;
    const second = base.signals[1]!;
    const document: CanonicalDocument = {
      ...base,
      annotations: [
        { id: "ann_second" as AnnotationId, type: "text", label: "Second", visible: true, anchor: { signalId: second.id, cycle: 2, point: "cycle-start" } },
        { id: "ann_first" as AnnotationId, type: "ghostTrace", label: "First", visible: true, sourceSignalId: first.id, start: { signalId: first.id, cycle: 1, point: "cycle-start" }, end: { signalId: first.id, cycle: 3, point: "cycle-end" } },
      ],
    };
    const expected = canonicalReferences(document).filter((reference) => reference.targetType === "signal" && (reference.targetId === first.id || reference.targetId === second.id));
    const before = canonicalReferenceMetrics();

    const references = referencesToAny(document, "signal", [second.id, first.id, second.id]);
    expect([...references].sort((a, b) => a.path.localeCompare(b.path))).toEqual([...expected].sort((a, b) => a.path.localeCompare(b.path)));
    expect(new Set(references.map((reference) => reference.path)).size).toBe(references.length);
    expect(annotationsForReferences(document, references).map((annotation) => annotation.id)).toEqual(["ann_second", "ann_first"]);

    const after = canonicalReferenceMetrics();
    expect(after.indexBuilds - before.indexBuilds).toBe(1);
    expect(after.referencesEnumerated - before.referencesEnumerated).toBe(canonicalReferences(document).length);
    expect(after.targetQueries - before.targetQueries).toBe(1);
    expect(after.referencesVisited - before.referencesVisited).toBe(references.length);
  });

  it("builds one target index per immutable document snapshot and matches authoritative enumeration", () => {
    const document = canonicalFixture();
    const allReferences = canonicalReferences(document);
    for (const targetType of ["signal", "time-group", "group", "spacer", "bookmark", "enum"] as const) {
      const targetIds = new Set(allReferences.filter((reference) => reference.targetType === targetType).map((reference) => reference.targetId));
      for (const targetId of targetIds) {
        const bucket = referencesTo(document, targetType, targetId);
        expect(bucket).toEqual(allReferences.filter((reference) => reference.targetType === targetType && reference.targetId === targetId));
        expect(referencesTo(document, targetType, targetId)).toBe(bucket);
      }
    }

    const nextSnapshot = { ...document, annotations: [...document.annotations] };
    expect(referencesTo(nextSnapshot, "signal", document.signals[0]!.id)).not.toBe(referencesTo(document, "signal", document.signals[0]!.id));
  });

  it("reuses the reference index when only document metadata changes", () => {
    const document = canonicalFixture();
    const signalId = document.signals[0]!.id;
    const originalBucket = referencesToSignal(document, signalId);
    const nextSnapshot: CanonicalDocument = {
      ...document,
      layout: { ...document.layout },
      document: { ...document.document, title: "Renamed document" },
    };

    expect(referencesToSignal(nextSnapshot, signalId)).toBe(originalBucket);
  });

  it("rebuilds document-owned references when the stable document identity changes", () => {
    const document = canonicalFixture();
    const signalId = document.signals[0]!.id;
    const originalBucket = referencesToSignal(document, signalId);
    const nextDocumentId = "fixture_reidentified" as typeof document.document.id;
    const nextSnapshot: CanonicalDocument = { ...document, document: { ...document.document, id: nextDocumentId } };

    expect(referencesToSignal(nextSnapshot, signalId)).not.toBe(originalBucket);
    expect(referencesToSignal(nextSnapshot, signalId)).toContainEqual(expect.objectContaining({
      kind: "timeline.referenceClock",
      ownerId: nextDocumentId,
      targetId: signalId,
    }));
  });

  it("enumerates the supported signal and time-group relationships from one owner", () => {
    const base = canonicalFixture();
    const signal = base.signals[1]!;
    const groupId = "time_registry" as TimeGroupId;
    const annotation = {
      id: "ann_registry" as AnnotationId,
      type: "ghostTrace" as const,
      label: "Previous",
      visible: true,
      sourceSignalId: signal.id,
      start: { signalId: signal.id, cycle: 1, point: "cycle-start" as const },
      end: { signalId: signal.id, cycle: 3, point: "cycle-end" as const },
    };
    const document: CanonicalDocument = {
      ...base,
      timeGroups: [{ id: groupId, name: "Fold", start: 3, end: 5, presentation: { resumeLabelAnchorId: "label_registry" as LabelAnchorId } }],
      timeline: {
        ...base.timeline,
        labelAnchors: [{ id: "label_registry" as LabelAnchorId, source: 5, display: 100, ownerTimeGroupId: groupId }],
      },
      annotations: [annotation],
      transactions: [{ id: "txn_registry" as TransactionId, name: "DMA", start: 1, end: 3, linkedSignals: [signal.id] }],
    };

    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(canonicalReferences(document).map((reference) => reference.kind)).toEqual([
      "timeGroup.resumeLabelAnchor",
      "timeline.referenceClock",
      "annotation.anchor",
      "annotation.anchor",
      "annotation.ghostTraceSource",
      "transaction.linkedSignal",
      "labelAnchor.ownerTimeGroup",
      "signalGroup.row",
      "signalGroup.row",
    ]);
    expect(referencesToSignal(document, signal.id as SignalId).map((reference) => reference.kind)).toEqual([
      "annotation.anchor",
      "annotation.anchor",
      "annotation.ghostTraceSource",
      "transaction.linkedSignal",
      "signalGroup.row",
    ]);
    expect(referencesToTimeGroup(document, groupId).map((reference) => reference.kind)).toEqual(["labelAnchor.ownerTimeGroup"]);
    expect(referencesFromOwner(document, groupId).map((reference) => reference.kind)).toEqual(["timeGroup.resumeLabelAnchor"]);
  });

  it("gives validation one authoritative missing-reference path", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      timeline: { ...base.timeline, referenceClock: "sig_missing" as SignalId },
    };
    expect(validateCanonicalDocument(document)).toEqual([
      expect.objectContaining({
        code: "MISSING_CROSS_REFERENCE",
        path: "$.timeline.referenceClock",
        message: "Signal 'sig_missing' does not exist.",
      }),
    ]);
  });

  it("registers Marker vertical-span boundaries as Signal references", () => {
    const base = canonicalFixture();
    const marker = { id: "marker_span_registry" as AnnotationId, type: "marker" as const, label: "Span", visible: true, anchor: { cycle: 2, point: "cycle-start" as const }, verticalSpan: { mode: "rows" as const, startRowId: base.signals[0]!.id, endRowId: base.signals[1]!.id } };
    const document = { ...base, annotations: [marker] };
    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(canonicalReferences(document).filter((reference) => reference.ownerId === marker.id).map((reference) => reference.kind)).toEqual(["annotation.markerSpanStart", "annotation.markerSpanEnd"]);
    expect(referencesToSignal(document, base.signals[0]!.id).map((reference) => reference.kind)).toContain("annotation.markerSpanStart");
  });

  it("registers an Edge Counter marker by explicit Bookmark identity", () => {
    const base = canonicalFixture();
    const markerA = { id: "bookmark_a" as BookmarkId, name: "A", start: 1 };
    const markerB = { id: "bookmark_b" as BookmarkId, name: "B", start: 6 };
    const clock = base.signals[0]!;
    const document: CanonicalDocument = {
      ...base,
      bookmarks: [markerA, markerB],
      signals: [{ ...clock, type: "clock", edgeCounter: { ...clock.edgeCounter, countFrom: "marker", anchorId: markerB.id } }, ...base.signals.slice(1)],
    };

    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(canonicalReferences(document)).toContainEqual({ kind: "signal.edgeCounter.marker", ownerId: clock.id, targetId: markerB.id, targetType: "bookmark", path: "$.signals[0].edgeCounter.anchorId" });

    const missing = { ...document, signals: [{ ...document.signals[0]!, type: "clock", edgeCounter: { ...clock.edgeCounter, countFrom: "marker", anchorId: "bookmark_missing" } }, ...document.signals.slice(1)] };
    expect(validateCanonicalDocument(missing)).toContainEqual(expect.objectContaining({ code: "MISSING_CROSS_REFERENCE", path: "$.signals[0].edgeCounter.anchorId", message: "Bookmark 'bookmark_missing' does not exist." }));
  });

  it("registers group row membership and spacer ownership as canonical relationships", () => {
    const base = canonicalFixture();
    const spacerId = "spacer_registry" as never;
    const groupId = base.signalGroups[0]!.id;
    const document: CanonicalDocument = {
      ...base,
      signalGroups: [{ ...base.signalGroups[0]!, rows: [...base.signalGroups[0]!.rows, spacerId], spacers: [{ id: spacerId, height: 12 }] }],
    };

    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(canonicalReferences(document).filter((reference) => reference.kind === "signalGroup.row" || reference.kind === "spacer.ownerGroup")).toEqual([
      expect.objectContaining({ kind: "signalGroup.row", ownerId: groupId, targetId: "sig_clk", targetType: "signal", path: "$.signalGroups[0].rows[0]" }),
      expect.objectContaining({ kind: "signalGroup.row", ownerId: groupId, targetId: "sig_data", targetType: "signal", path: "$.signalGroups[0].rows[1]" }),
      expect.objectContaining({ kind: "signalGroup.row", ownerId: groupId, targetId: spacerId, targetType: "spacer", path: "$.signalGroups[0].rows[2]" }),
      expect.objectContaining({ kind: "spacer.ownerGroup", ownerId: spacerId, targetId: groupId, targetType: "group", path: "$.signalGroups[0].spacers[0]" }),
    ]);
  });

  it("covers remaining stable-ID owners and typed Constraint dependencies through the registry", () => {
    const base = canonicalFixture();
    const signalId = base.signals[1]!.id;
    const annotationId = "ann_member" as AnnotationId;
    const groupId = "tg_owner" as TimeGroupId;
    const labelId = "label_owner" as LabelAnchorId;
    const txnGroupId = "txg_owner" as TransactionGroupId;
    const annotationGroupId = "ag_owner" as AnnotationGroupId;
    const annotation = { id: annotationId, type: "text" as const, label: "Note", visible: true, anchor: { signalId, cycle: 2, point: "cycle-start" as const } };
    const document: CanonicalDocument = {
      ...base,
      annotations: [annotation],
      annotationGroups: [{ id: annotationGroupId, annotationIds: [annotationId] }],
      timeGroups: [{ id: groupId, name: "Fold", start: 3, end: 5, presentation: { resumeLabelAnchorId: labelId } }],
      timeline: { ...base.timeline, labelAnchors: [{ id: labelId, source: 5, display: 5, ownerTimeGroupId: groupId }] },
      transactionGroups: [{ id: txnGroupId, name: "DMA", order: 0 }],
      transactions: [{ id: "txn_grouped" as TransactionId, name: "Read", start: 1, end: 3, groupId: txnGroupId, linkedSignals: [signalId] }],
      constraints: [
        { id: "constraint_handshake" as ConstraintId, type: "handshake", data: { requestSignalId: signalId, acknowledgeSignalId: "missing_ack", stableSignalIds: ["missing_stable"] } },
        { id: "constraint_latency_range" as ConstraintId, type: "latency-range", data: { requestSignalId: "missing_req", acknowledgeSignalId: signalId } },
        { id: "constraint_latency" as ConstraintId, type: "latency", data: { triggerSignalId: signalId, responseSignalId: "missing_response" } },
      ],
      enumDefinitions: [{ id: "enum_registry", name: "Mode", entries: [{ value: 0, label: "Idle" }] }],
      signals: base.signals.map((signal) => signal.id === signalId ? { ...signal, enumId: "enum_registry" } : signal),
    };

    const references = canonicalReferences(document);
    for (const kind of ["signal.enum", "annotationGroup.member", "timeGroup.resumeLabelAnchor", "transaction.group", "constraint.handshakeRequest", "constraint.handshakeAcknowledge", "constraint.handshakeStableSignal", "constraint.latencyRangeRequest", "constraint.latencyRangeAcknowledge", "constraint.latencyTrigger", "constraint.latencyResponse"] as const) {
      expect(references.some((reference) => reference.kind === kind), kind).toBe(true);
    }
    expect(referencesToSignal(document, signalId).filter((reference) => reference.kind.startsWith("constraint."))).toHaveLength(3);
    expect(validateCanonicalDocument(document)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_CROSS_REFERENCE", path: "$.constraints[0].data.acknowledgeSignalId" }),
      expect.objectContaining({ code: "MISSING_CROSS_REFERENCE", path: "$.constraints[0].data.stableSignalIds[0]" }),
      expect.objectContaining({ code: "MISSING_CROSS_REFERENCE", path: "$.constraints[1].data.requestSignalId" }),
      expect.objectContaining({ code: "MISSING_CROSS_REFERENCE", path: "$.constraints[2].data.responseSignalId" }),
    ]));
    const withoutConstraintAndMembership: CanonicalDocument = { ...document, constraints: [], annotationGroups: [] };
    expect(referencesToSignal(withoutConstraintAndMembership, signalId).some((reference) => reference.kind.startsWith("constraint."))).toBe(false);
    expect(canonicalReferences(withoutConstraintAndMembership).some((reference) => reference.kind === "annotationGroup.member")).toBe(false);
  });

  it("validates and indexes one fixture for every registered relationship kind", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    const signal = base.signals[1]!;
    const spacerId = "spacer_all_refs" as never;
    const parentId = "tg_parent_refs" as TimeGroupId;
    const childId = "tg_child_refs" as TimeGroupId;
    const labelId = "label_all_refs" as LabelAnchorId;
    const bookmarkId = "bookmark_all_refs" as BookmarkId;
    const enumId = "enum_all_refs";
    const textId = "ann_text_refs" as AnnotationId;
    const ghostId = "ann_ghost_refs" as AnnotationId;
    const markerId = "ann_marker_refs" as AnnotationId;
    const transactionId = "txn_all_refs" as TransactionId;
    const transactionGroupId = "txg_all_refs" as TransactionGroupId;
    const annotationGroupId = "ag_all_refs" as AnnotationGroupId;
    const referencesDocument: CanonicalDocument = {
      ...base,
      bookmarks: [{ id: bookmarkId, name: "Origin", start: 1 }],
      enumDefinitions: [{ id: enumId, name: "Mode", entries: [{ value: 0, label: "Idle" }] }],
      signals: [
        { ...clock, type: "clock", edgeCounter: { ...clock.edgeCounter, countFrom: "marker", anchorId: bookmarkId } },
        { ...signal, enumId },
      ],
      signalGroups: base.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, spacerId], spacers: [{ id: spacerId, height: 8 }] } : group),
      timeGroups: [
        { id: parentId, name: "Parent", start: 1, end: 8 },
        { id: childId, parentId, name: "Child", start: 3, end: 5, presentation: { resumeLabelAnchorId: labelId } },
      ],
      timeline: { ...base.timeline, labelAnchors: [{ id: labelId, source: 5, display: 5, ownerTimeGroupId: childId }] },
      annotations: [
        { id: textId, type: "text", label: "T", visible: true, anchor: { signalId: signal.id, cycle: 2, point: "cycle-start" } },
        { id: ghostId, type: "ghostTrace", label: "G", visible: true, sourceSignalId: signal.id, start: { signalId: signal.id, cycle: 2, point: "cycle-start" }, end: { signalId: signal.id, cycle: 4, point: "cycle-end" } },
        { id: markerId, type: "marker", label: "M", visible: true, anchor: { cycle: 3, point: "cycle-start" }, verticalSpan: { mode: "rows", startRowId: signal.id, endRowId: clock.id } },
      ],
      annotationGroups: [{ id: annotationGroupId, annotationIds: [textId] }],
      transactions: [{ id: transactionId, name: "Read", start: 1, end: 4, groupId: transactionGroupId, linkedSignals: [signal.id] }],
      transactionGroups: [{ id: transactionGroupId, name: "Memory", order: 0 }],
      constraints: [
        { id: "constraint_handshake_all" as ConstraintId, type: "handshake", data: { requestSignalId: signal.id, acknowledgeSignalId: signal.id, stableSignalIds: [signal.id] } },
        { id: "constraint_range_all" as ConstraintId, type: "latency-range", data: { requestSignalId: signal.id, acknowledgeSignalId: signal.id } },
        { id: "constraint_latency_all" as ConstraintId, type: "latency", data: { triggerSignalId: signal.id, responseSignalId: signal.id } },
      ],
    };
    const references = canonicalReferences(referencesDocument);
    expect(validateCanonicalDocument(referencesDocument)).toEqual([]);
    expect([...new Set(references.map((reference) => reference.kind))].sort()).toEqual([...CANONICAL_REFERENCE_KINDS].sort());
    for (const reference of references) {
      expect(referencesTo(referencesDocument, reference.targetType, reference.targetId)).toContainEqual(reference);
    }
  });
});
