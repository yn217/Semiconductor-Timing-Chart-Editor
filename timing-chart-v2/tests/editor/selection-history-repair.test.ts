import { describe, expect, it } from "vitest";
import type { AnnotationId, CanonicalDocument, GroupId, SpacerId, TransactionId, TransactionPhaseId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { repairSelectionAgainstDocument } from "../../apps/editor/src/application/selection-history-repair.js";
import type { SelectionState } from "../../apps/editor/src/application/use-selection-owner.js";

const emptySelection = (): SelectionState => ({
  signalId: undefined, signalIds: new Set(), groupId: undefined, spacerId: undefined,
  annotationId: undefined, annotationIds: new Set(), transactionId: undefined,
  transactionPhaseId: undefined, legendSelected: false, transactionIds: new Set(),
});

describe("History selection membership repair", () => {
  it("prunes removed annotation, group, spacer, transaction and phase IDs while retaining the valid parent Transaction", () => {
    const base = canonicalFixture();
    const document: CanonicalDocument = {
      ...base,
      signalGroups: [{ ...base.signalGroups[0]!, spacers: [{ id: "space_live" as SpacerId, height: 24 }] }],
      annotations: [{ id: "annotation_live" as AnnotationId, label: "Live", type: "range", start: 1, end: 2 } as CanonicalDocument["annotations"][number]],
      transactions: [{ id: "transaction_live" as TransactionId, name: "Live", start: 0, end: 4, phases: [{ id: "phase_live" as TransactionPhaseId, name: "Address", start: 0, end: 2 }] }],
    };
    const selected: SelectionState = {
      ...emptySelection(), groupId: "grp_missing" as GroupId, spacerId: "space_missing" as SpacerId,
      annotationId: "annotation_missing" as AnnotationId, annotationIds: new Set(["annotation_missing" as AnnotationId]),
      transactionId: "transaction_live", transactionIds: new Set(["transaction_live", "transaction_missing"] as TransactionId[]),
      transactionPhaseId: "phase_missing" as TransactionPhaseId,
    };

    const repaired = repairSelectionAgainstDocument(selected, document);

    expect(repaired.groupId).toBeUndefined();
    expect(repaired.spacerId).toBeUndefined();
    expect(repaired.annotationId).toBeUndefined();
    expect(repaired.annotationIds.size).toBe(0);
    expect(repaired.transactionId).toBe("transaction_live");
    expect(repaired.transactionIds).toEqual(new Set(["transaction_live"]));
    expect(repaired.transactionPhaseId).toBeUndefined();
  });

  it("preserves valid selection and prunes only removed members of multi-selection", () => {
    const document = canonicalFixture();
    const signalA = document.signals[0]!.id;
    const signalB = document.signals[1]!.id;
    const selection: SelectionState = { ...emptySelection(), signalId: signalA, signalIds: new Set([signalA, signalB, "signal_removed" as typeof signalA]) };

    const repaired = repairSelectionAgainstDocument(selection, document);

    expect(repaired.signalId).toBe(signalA);
    expect(repaired.signalIds).toEqual(new Set([signalA, signalB]));
    expect(repairSelectionAgainstDocument(repaired, document)).toBe(repaired);
  });

  it("falls back from a removed Spacer to its still-existing parent Group", () => {
    const document = canonicalFixture();
    const selection: SelectionState = { ...emptySelection(), groupId: "grp_main" as GroupId, spacerId: "space_removed" as SpacerId };

    const repaired = repairSelectionAgainstDocument(selection, document);

    expect(repaired.groupId).toBe("grp_main");
    expect(repaired.spacerId).toBeUndefined();
  });

  it("repairs a removed selected Transaction and its phase without stealing an unrelated valid selection", () => {
    const document = canonicalFixture();
    const validTransaction = { id: "tx_valid" as TransactionId, name: "Valid", start: 0, end: 4 };
    const nextDocument = { ...document, transactions: [validTransaction] };
    const selection: SelectionState = {
      ...emptySelection(), transactionId: "tx_removed" as TransactionId,
      transactionIds: new Set(["tx_removed", "tx_valid"] as TransactionId[]),
      transactionPhaseId: "phase_removed" as TransactionPhaseId,
    };

    const repaired = repairSelectionAgainstDocument(selection, nextDocument);

    expect(repaired.transactionId).toBe("tx_valid");
    expect(repaired.transactionIds).toEqual(new Set(["tx_valid"]));
    expect(repaired.transactionPhaseId).toBeUndefined();
    const unrelatedSignal = document.signals[0]!.id;
    const unrelated: SelectionState = { ...emptySelection(), signalId: unrelatedSignal, signalIds: new Set([unrelatedSignal]) };
    expect(repairSelectionAgainstDocument(unrelated, nextDocument)).toBe(unrelated);
  });
});
