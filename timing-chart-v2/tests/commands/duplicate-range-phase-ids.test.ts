import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { validateCanonicalDocument, type CommandId, type SignalId, type Transaction, type TransactionId, type TransactionPhaseId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("timeline.duplicateRange with a Transaction inside the range", () => {
  it("clones its Phases with fresh IDs so the Document stays valid", () => {
    const base = canonicalFixture();
    const transaction: Transaction = {
      id: "txn_dup" as TransactionId, name: "TX", start: 1, end: 3, laneId: "lane_0", linkedSignals: [base.signals[0]!.id as SignalId],
      phases: [{ id: "phase_dup_a" as TransactionPhaseId, name: "A", start: 1, end: 2 }, { id: "phase_dup_b" as TransactionPhaseId, name: "B", start: 2, end: 3 }],
    };
    const document = { ...base, transactions: [...base.transactions, transaction] };
    expect(validateCanonicalDocument(document)).toEqual([]);
    const session = new CommandHistorySession(document);
    const result = session.execute({ id: "dup_phase_ids" as CommandId, type: "timeline.duplicateRange", start: 0, end: 4, at: 4 });
    expect(result.ok).toBe(true);
    const next = session.getSnapshot().document;
    expect(validateCanonicalDocument(next)).toEqual([]);
    const phaseIds = next.transactions.flatMap((item) => (item.phases ?? []).map((phase) => phase.id));
    expect(new Set(phaseIds).size).toBe(phaseIds.length);
    expect(phaseIds.length).toBe(4);
  });
});
