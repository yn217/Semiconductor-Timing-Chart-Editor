import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CanonicalDocument, CommandId, TransactionId, TransactionPhaseId } from "@timing-chart-v2/schema";
import { buildTypedProposalBatch, buildTypedTransactionProposal } from "../../apps/editor/src/ai-proposal-provider.js";
import { describeAIProposalCommands } from "../../apps/editor/src/ai-operation-panel.js";
import { executeAIBridgeTool, type AIBridgeContext } from "../../apps/editor/src/ai-bridge-client.js";
import { canonicalFixture } from "../fixtures/canonical.js";

function fixture(): CanonicalDocument {
  const base = canonicalFixture();
  return { ...base, timeline: { ...base.timeline, end: 12, cycleCount: 12 }, transactions: [{
    id: "tx_identity" as TransactionId, name: "Transfer", start: 0, end: 12,
    phases: [
      { id: "phase_A" as TransactionPhaseId, name: "A", start: 0, end: 2 },
      { id: "phase_B" as TransactionPhaseId, name: "B", start: 4, end: 6 },
      { id: "phase_C" as TransactionPhaseId, name: "C", start: 8, end: 10 },
    ],
  }] };
}
const update = (phaseId: string, name: string, startCycle: number, endCycle: number) => ({ tool: "propose_update_phase", arguments: { transactionId: "tx_identity", phaseId, name, startCycle, endCycle } });
const remove = (phaseId: string) => ({ tool: "propose_delete_phase", arguments: { transactionId: "tx_identity", phaseId } });

describe("AI Phase stable proposal identity", () => {
  it("publishes canonical Phase IDs in the read-only bridge result", () => {
    const document = fixture();
    const before = JSON.stringify(document);
    const result = executeAIBridgeTool("get_transaction_phases", { transactionId: "tx_identity" }, { document } as AIBridgeContext);
    expect(result).toEqual({ transactionId: "tx_identity", phases: document.transactions[0]!.phases });
    expect(JSON.stringify(document)).toBe(before);
  });

  it("moves A across B, then updates and deletes B with truthful sequential preview", () => {
    const document = fixture();
    const built = buildTypedProposalBatch(document, 0, [update("phase_A", "A moved", 6, 8), update("phase_B", "B renamed", 4, 6), remove("phase_B")]);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error(built.message);
    const summary = describeAIProposalCommands(document, built.proposal.commands);
    expect(summary[2]).toEqual({ title: "Delete Phase B renamed from Transfer", detail: "Phase ID phase_B · Transaction ID tx_identity" });
    const session = new CommandHistorySession(document);
    expect(session.executeBatch("cmd_phase_batch" as CommandId, built.proposal.commands).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]!.phases?.map((phase) => phase.id)).toEqual(["phase_A", "phase_C"]);
    expect(session.historyState()).toMatchObject({ undoDepth: 1, dirty: true });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]!.phases?.map((phase) => phase.id)).toEqual(["phase_A", "phase_C"]);
  });

  it("deletes A then updates B despite its shifted index", () => {
    const document = fixture();
    const built = buildTypedProposalBatch(document, 0, [remove("phase_A"), update("phase_B", "B updated", 4, 6)]);
    if (!built.ok) throw new Error(built.message);
    const session = new CommandHistorySession(document);
    expect(session.executeBatch("cmd_delete_then_update" as CommandId, built.proposal.commands).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]!.phases).toEqual([
      { id: "phase_B", name: "B updated", start: 4, end: 6 },
      { id: "phase_C", name: "C", start: 8, end: 10 },
    ]);
  });

  it("targets a newly added Phase by the requested stable proposal ID", () => {
    const document = fixture();
    const built = buildTypedProposalBatch(document, 0, [
      { tool: "propose_add_phase", arguments: { transactionId: "tx_identity", phaseId: "phase_new", name: "New", startCycle: 2, endCycle: 4 } },
      update("phase_new", "New renamed", 2, 4), remove("phase_new"),
    ]);
    if (!built.ok) throw new Error(built.message);
    expect(describeAIProposalCommands(document, built.proposal.commands)[2]).toMatchObject({ title: "Delete Phase New renamed from Transfer", detail: expect.stringContaining("phase_new") });
    const session = new CommandHistorySession(document);
    expect(session.executeBatch("cmd_new_phase" as CommandId, built.proposal.commands).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]!.phases).toEqual(document.transactions[0]!.phases);
  });

  it("rejects legacy indexes, missing IDs and duplicate creation without mutating the source", () => {
    const document = fixture();
    const before = JSON.stringify(document);
    expect(buildTypedTransactionProposal(document, 0, "propose_delete_phase", { transactionId: "tx_identity", phaseIndex: 1 }).ok).toBe(false);
    expect(buildTypedProposalBatch(document, 0, [remove("phase_A"), update("missing", "Wrong", 4, 6)]).ok).toBe(false);
    expect(buildTypedTransactionProposal(document, 0, "propose_add_phase", { transactionId: "tx_identity", phaseId: "phase_B", name: "Duplicate", startCycle: 2, endCycle: 4 }).ok).toBe(false);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("resolves stable ID at actual command planning and atomically rejects an absent ID", () => {
    const document = fixture();
    const session = new CommandHistorySession(document);
    expect(session.execute({ id: "cmd_id_over_index" as CommandId, type: "transaction.phaseDelete", transactionId: "tx_identity" as TransactionId, phaseIndex: 0, phaseId: "phase_B" as TransactionPhaseId }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]!.phases?.map((phase) => phase.id)).toEqual(["phase_A", "phase_C"]);
    const before = session.getSnapshot();
    const history = session.historyState();
    const built = buildTypedProposalBatch(document, 0, [remove("phase_A"), remove("phase_B")]);
    if (!built.ok) throw new Error(built.message);
    expect(session.executeBatch("cmd_stale_phase" as CommandId, built.proposal.commands).ok).toBe(false);
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(history);
  });
});
