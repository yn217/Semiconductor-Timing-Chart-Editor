import { describe, expect, it } from "vitest";
import { canonicalReferences, referencesToSignal, referencesToTimeGroup, validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { AnnotationId, BookmarkId, CanonicalDocument, LabelAnchorId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("canonical stable-ID reference registry", () => {
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
