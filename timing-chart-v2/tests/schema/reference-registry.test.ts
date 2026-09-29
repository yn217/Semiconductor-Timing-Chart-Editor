import { describe, expect, it } from "vitest";
import { canonicalReferences, getCanonicalReferenceMetrics, referencesTo, referencesToSignal, referencesToTargets, referencesToTimeGroup, resetCanonicalReferenceMetrics, validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { AnnotationId, BookmarkId, CanonicalDocument, LabelAnchorId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("canonical stable-ID reference registry", () => {
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

  it("queries many targets from one indexed pass and reports bounded work", () => {
    const document = canonicalFixture();
    const authoritative = canonicalReferences(document);
    const targetIds = [document.signals[0]!.id, document.signals[1]!.id, document.signals[0]!.id];
    const uniqueTargetIds = new Set(targetIds);
    const expected = authoritative.filter((reference) => reference.targetType === "signal" && uniqueTargetIds.has(reference.targetId as SignalId));

    resetCanonicalReferenceMetrics();
    const actual = referencesToTargets(document, "signal", targetIds);
    const metrics = getCanonicalReferenceMetrics();

    expect(actual).toEqual(expected);
    expect(metrics).toEqual({
      indexBuilds: 1,
      canonicalReferenceScans: 1,
      canonicalReferencesEnumerated: authoritative.length,
      targetQueries: 1,
      referencesVisited: expected.length,
      affectedSignalCount: uniqueTargetIds.size,
    });
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
});
