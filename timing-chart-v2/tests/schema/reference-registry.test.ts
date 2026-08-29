import { describe, expect, it } from "vitest";
import { canonicalReferences, referencesToSignal, validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { AnnotationId, CanonicalDocument, LabelAnchorId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";
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
    ]);
    expect(referencesToSignal(document, signal.id as SignalId).map((reference) => reference.kind)).toEqual([
      "annotation.anchor",
      "annotation.anchor",
      "annotation.ghostTraceSource",
      "transaction.linkedSignal",
    ]);
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
});
