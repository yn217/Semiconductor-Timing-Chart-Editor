import { describe, expect, it } from "vitest";
import { planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { buildTypedAnnotationProposal, buildTypedBookmarkProposal, buildTypedProposalBatch, buildTypedSignalGroupProposal, buildTypedSignalProposal, buildTypedTimeGroupProposal, buildTypedTimelineProposal, buildTypedTransactionGroupProposal, buildTypedTransactionProposal, deterministicMockAIProposalProvider } from "../../apps/editor/src/ai-proposal-provider.js";
import { canonicalFixture } from "../fixtures/canonical.js";
import type { AnnotationId, CommandId, GroupId, SignalId, TimeGroupId, TransactionGroupId, TransactionId, TransactionPhaseId } from "@timing-chart-v2/schema";

describe("deterministic AI proposal provider", () => {
  it("builds an ordered multi-operation proposal that applies and undoes as one atomic History action", () => {
    const document = canonicalFixture();
    const built = buildTypedProposalBatch(document, 44, [
      { tool: "propose_rename_signal", arguments: { signalId: "sig_data", name: "DATA_BATCHED" } },
      { tool: "propose_create_bookmark", arguments: { name: "Checkpoint", cycle: 3 } },
      { tool: "propose_create_bookmark", arguments: { name: "Second checkpoint", cycle: 4 } },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.proposal.baseRevision).toBe(44);
    expect(built.proposal.commands.map((item) => item.type)).toEqual(["signal.rename", "bookmark.create", "bookmark.create"]);
    expect(new Set(built.proposal.commands.filter((item) => item.type === "bookmark.create").map((item) => item.bookmark.id)).size).toBe(2);

    const session = new CommandHistorySession(document);
    expect(session.executeBatch("cmd_ai_multi_operation" as CommandId, built.proposal.commands).ok).toBe(true);
    expect(session.historyState()).toMatchObject({ undoDepth: 1, dirty: true });
    expect(session.getSnapshot().document.signals.find((item) => item.id === "sig_data")?.name).toBe("DATA_BATCHED");
    expect(session.getSnapshot().document.bookmarks).toHaveLength(document.bookmarks.length + 2);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
  });

  it("rejects the whole typed proposal when any operation is invalid or outside the tool allowlist", () => {
    const document = canonicalFixture();
    expect(buildTypedProposalBatch(document, 4, [
      { tool: "propose_rename_signal", arguments: { signalId: "sig_data", name: "DATA_OK" } },
      { tool: "propose_delete_transaction", arguments: { transactionId: "missing" } },
    ])).toMatchObject({ ok: false, message: expect.stringContaining("operations[1]") });
    expect(buildTypedProposalBatch(document, 4, [
      { tool: "arbitrary_json_patch", arguments: { path: "$.signals", value: [] } },
    ])).toMatchObject({ ok: false, message: expect.stringContaining("unsupported proposal tool") });
    expect(buildTypedProposalBatch(document, 4, Array.from({ length: 51 }, () => ({ tool: "propose_rename_signal", arguments: { signalId: "sig_data", name: "DATA" } })))).toMatchObject({ ok: false, message: expect.stringContaining("between 1 and 50") });
  });

  it("builds a typed stable-ID rename proposal without mutating the canonical document", () => {
    const document = canonicalFixture();
    const result = buildTypedSignalProposal(document, 12, "propose_rename_signal", { signalId: "sig_data", name: " DATA_RENAMED " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.baseRevision).toBe(12);
      expect(result.proposal.commands).toEqual([expect.objectContaining({ type: "signal.rename", signalId: "sig_data", name: "DATA_RENAMED" })]);
    }
    expect(document.signals.find((signal) => signal.id === "sig_data")?.name).toBe("DATA");
    expect(buildTypedSignalProposal(document, 12, "propose_rename_signal", { signalId: "missing", name: "X" })).toEqual({ ok: false, message: "Signal 'missing' does not exist in the current document." });
    expect(buildTypedSignalProposal(document, 12, "propose_rename_signal", { signalId: "sig_data", name: " " })).toEqual({ ok: false, message: "propose_rename_signal requires a non-empty name." });
  });

  it("builds a typed Signal create proposal through signal.create and validates type/group/value", () => {
    const document = canonicalFixture();
    const groupId = document.signalGroups[0]!.id;
    const created = buildTypedSignalProposal(document, 12, "propose_create_signal", { name: " READY ", type: "event", role: "output", groupId, initialValue: "rise" });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal.commands).toEqual([expect.objectContaining({ type: "signal.create", targetGroupId: groupId, index: document.signalGroups[0]!.rows.length, signal: expect.objectContaining({ name: "READY", type: "event", role: "output", values: [{ start: 0, value: "rise" }] }) })]);
    expect(buildTypedSignalProposal(document, 12, "propose_create_signal", { name: "Bad", type: "event", role: "internal", groupId, initialValue: "unknown" })).toMatchObject({ ok: false, message: expect.stringContaining("not supported for event") });
    expect(buildTypedSignalProposal(document, 12, "propose_create_signal", { name: "Bad", type: "binary", role: "internal", groupId: "missing" })).toEqual({ ok: false, message: "Signal Group 'missing' does not exist in the current document." });
    expect(buildTypedSignalProposal(document, 12, "propose_create_signal", { name: "Bad", type: "binary", role: "internal", groupId, width: 8 })).toEqual({ ok: false, message: "width is supported only for bus signals." });
    expect(document.signals.some((signal) => signal.display.name === "READY")).toBe(false);
  });

  it("builds typed role/visibility proposals using the existing signal update command", () => {
    const document = canonicalFixture();
    const result = buildTypedSignalProposal(document, 13, "propose_update_signal", { signalId: "sig_data", role: "output", visible: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.commands).toEqual([expect.objectContaining({ type: "signal.updateProperties", signalId: "sig_data", name: "DATA", role: "output", visible: false })]);
    expect(buildTypedSignalProposal(document, 13, "propose_update_signal", { signalId: "sig_data" })).toEqual({ ok: false, message: "propose_update_signal requires role, visible, or displayStyle." });
  });

  it("supports a typed displayStyle update through signal.updateProperties and rejects non-JSON values", () => {
    const document = canonicalFixture();
    const displayStyle = { color: "#114477", waveformColor: "#006699", fontSize: 12 };
    const result = buildTypedSignalProposal(document, 13, "propose_update_signal", { signalId: "sig_data", displayStyle });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.summary).toBe("Update DATA display style");
      expect(result.proposal.commands).toEqual([expect.objectContaining({ type: "signal.updateProperties", signalId: "sig_data", name: "DATA", role: "internal", displayStyle })]);
      const planned = planCommand(document, result.proposal.commands[0]!);
      expect(planned.ok).toBe(true);
      if (planned.ok) {
        expect(planned.document.signals.find((signal) => signal.id === "sig_data")?.display.style).toEqual(displayStyle);
        expect(planned.changeSet.waveSemantics).toBeUndefined();
        expect(planned.changeSet.geometryLocal).toBeUndefined();
      }
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(buildTypedSignalProposal(document, 13, "propose_update_signal", { signalId: "sig_data", displayStyle: cyclic })).toEqual({ ok: false, message: "displayStyle must be a JSON object." });
    expect(buildTypedSignalProposal(document, 13, "propose_update_signal", { signalId: "sig_data" })).toEqual({ ok: false, message: "propose_update_signal requires role, visible, or displayStyle." });
  });

  it("builds typed signal-move proposals using stable Signal and Group IDs", () => {
    const base = canonicalFixture();
    const document = { ...base, signalGroups: [...base.signalGroups, { id: "grp_aux" as GroupId, name: "Aux", rows: [] }] };
    const result = buildTypedSignalProposal(document, 14, "propose_move_signal", { signalId: "sig_data", targetGroupId: "grp_aux" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.commands).toEqual([expect.objectContaining({ type: "signal.move", signalId: "sig_data", targetGroupId: "grp_aux", index: 0 })]);
    expect(buildTypedSignalProposal(document, 14, "propose_move_signal", { signalId: "sig_data", targetGroupId: "missing" })).toEqual({ ok: false, message: "Signal Group 'missing' does not exist in the current document." });
  });

  it("maps typed cycle-range proposals to existing timeline SemanticCommands", () => {
    const document = canonicalFixture();
    const inserted = buildTypedTimelineProposal(document, 21, "propose_insert_cycles", { at: 4, count: 2 });
    expect(inserted.ok).toBe(true);
    if (inserted.ok) expect(inserted.proposal.commands).toEqual([expect.objectContaining({ type: "timeline.insert", at: 4, count: 2 })]);
    const deleted = buildTypedTimelineProposal(document, 21, "propose_delete_cycles", { start: 2, end: 5 });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal.commands).toEqual([expect.objectContaining({ type: "timeline.delete", start: 2, end: 5 })]);
    const moved = buildTypedTimelineProposal(document, 21, "propose_move_range", { start: 2, end: 5, to: 7 });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.proposal.commands).toEqual([expect.objectContaining({ type: "timeline.moveRange", start: 2, end: 5, to: 7 })]);
    const duplicated = buildTypedTimelineProposal(document, 21, "propose_duplicate_range", { start: 2, end: 5, at: 7 });
    expect(duplicated.ok).toBe(true);
    if (duplicated.ok) expect(duplicated.proposal.commands).toEqual([expect.objectContaining({ type: "timeline.duplicateRange", start: 2, end: 5, at: 7 })]);
    expect(buildTypedTimelineProposal(document, 21, "propose_delete_cycles", { start: 5, end: 5 })).toEqual({ ok: false, message: "propose_delete_cycles requires integer boundaries within the timeline and end > start." });
    expect(document.timeline.cycleCount).toBe(canonicalFixture().timeline.cycleCount);
  });

  it("maps typed Signal Group create/rename/move/delete proposals to existing Group SemanticCommands", () => {
    const document = canonicalFixture();
    const created = buildTypedSignalGroupProposal(document, 22, "propose_create_signal_group", { name: " Auxiliary " });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal.commands).toEqual([expect.objectContaining({ type: "group.create", index: document.signalGroups.length, group: expect.objectContaining({ name: "Auxiliary", rows: [] }) })]);
    const renamed = buildTypedSignalGroupProposal(document, 22, "propose_rename_signal_group", { groupId: document.signalGroups[0]!.id, name: "Controls" });
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.proposal.commands).toEqual([expect.objectContaining({ type: "group.rename", groupId: document.signalGroups[0]!.id, name: "Controls" })]);
    const withEmptyGroups = { ...document, signalGroups: [...document.signalGroups, { id: "grp_aux" as GroupId, name: "Aux", rows: [] }, { id: "grp_spare" as GroupId, name: "Spare", rows: [] }] };
    const moved = buildTypedSignalGroupProposal(withEmptyGroups, 22, "propose_move_signal_group", { groupId: "grp_aux", index: 1 });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.proposal.commands).toEqual([expect.objectContaining({ type: "group.move", groupId: "grp_aux", index: 1 })]);
    const deleted = buildTypedSignalGroupProposal(withEmptyGroups, 22, "propose_delete_signal_group", { groupId: "grp_spare" });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal.commands).toEqual([expect.objectContaining({ type: "group.delete", groupId: "grp_spare" })]);
    expect(buildTypedSignalGroupProposal(document, 22, "propose_rename_signal_group", { groupId: "missing", name: "X" })).toEqual({ ok: false, message: "Signal Group 'missing' does not exist in the current document." });
    expect(buildTypedSignalGroupProposal(document, 22, "propose_move_signal_group", { groupId: "missing", index: 0 })).toEqual({ ok: false, message: "Signal Group 'missing' does not exist in the current document." });
    expect(buildTypedSignalGroupProposal(withEmptyGroups, 22, "propose_move_signal_group", { groupId: "grp_aux", index: 3 })).toEqual({ ok: false, message: "index must be an integer from 0 to 2 in the post-removal group list." });
    expect(buildTypedSignalGroupProposal(document, 22, "propose_delete_signal_group", { groupId: document.signalGroups[0]!.id })).toEqual({ ok: false, message: "Signal Group 'Main' is not empty; only empty Signal Groups can be deleted." });
  });

  it("maps typed Transaction proposals to existing Transaction SemanticCommands", () => {
    const base = canonicalFixture();
    const document = { ...base, transactions: [{ id: "transaction_1" as TransactionId, name: "Read", start: 1, end: 4, laneId: "lane_0" }] };
    const created = buildTypedTransactionProposal(document, 23, "propose_create_transaction", { name: "Write", start: 4, end: 7 });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.create", transaction: expect.objectContaining({ name: "Write", start: 4, end: 7, laneId: "lane_0" }) })]);
    const moved = buildTypedTransactionProposal(document, 23, "propose_move_transaction", { transactionId: "transaction_1", start: 2 });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.move", transactionId: "transaction_1", start: 2 })]);
    const resized = buildTypedTransactionProposal(document, 23, "propose_resize_transaction", { transactionId: "transaction_1", edge: "end", value: 6 });
    expect(resized.ok).toBe(true);
    if (resized.ok) expect(resized.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.resize", transactionId: "transaction_1", edge: "end", value: 6 })]);
    const updated = buildTypedTransactionProposal(document, 23, "propose_update_transaction", { transactionId: "transaction_1", description: "Updated description" });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.update", transactionId: "transaction_1", name: "Read", start: 1, end: 4, description: "Updated description" })]);
    expect(buildTypedTransactionProposal(document, 23, "propose_update_transaction", { transactionId: "transaction_1" })).toEqual({ ok: false, message: "propose_update_transaction requires at least one changed field." });
    const deleted = buildTypedTransactionProposal(document, 23, "propose_delete_transaction", { transactionId: "transaction_1" });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.delete", transactionId: "transaction_1" })]);
    expect(buildTypedTransactionProposal(document, 23, "propose_move_transaction", { transactionId: "missing", start: 2 })).toEqual({ ok: false, message: "Transaction 'missing' does not exist in the current document." });
  });

  it("maps Transaction Group create/rename/delete to stable-ID SemanticCommands with affected count", () => {
    const base = canonicalFixture();
    const groupId = "transaction_group_read" as TransactionGroupId;
    const document = { ...base, transactions: [{ id: "transaction_1" as TransactionId, name: "Read", start: 1, end: 4, groupId }], transactionGroups: [{ id: groupId, name: "Memory", order: 0, color: "#3382F6" }] };
    const created = buildTypedTransactionGroupProposal(document, 24, "propose_create_transaction_group", { name: " Bus ", color: "#123456" });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal.commands).toEqual([expect.objectContaining({ type: "transactionGroup.create", group: expect.objectContaining({ name: "Bus", order: 1, color: "#123456" }) })]);
    const renamed = buildTypedTransactionGroupProposal(document, 24, "propose_rename_transaction_group", { groupId, name: "System" });
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.proposal.commands).toEqual([expect.objectContaining({ type: "transactionGroup.rename", groupId, name: "System" })]);
    const deleted = buildTypedTransactionGroupProposal(document, 24, "propose_delete_transaction_group", { groupId });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal).toEqual(expect.objectContaining({ summary: "Delete Transaction Group Memory and ungroup 1 Transaction", commands: [expect.objectContaining({ type: "transactionGroup.delete", groupId })] }));
    expect(buildTypedTransactionGroupProposal(document, 24, "propose_rename_transaction_group", { groupId: "missing", name: "X" })).toMatchObject({ ok: false, message: expect.stringContaining("does not exist") });
    expect(buildTypedTransactionGroupProposal(document, 24, "propose_create_transaction_group", { name: "Bad", color: "red" })).toMatchObject({ ok: false, message: expect.stringContaining("six-digit") });
  });

  it("maps Time Group create/update/delete through stable-ID SemanticCommands and canonical source cycles", () => {
    const base = canonicalFixture();
    const groupId = "time_1" as TimeGroupId;
    const document = { ...base, timeline: { ...base.timeline, cycleCount: 20 }, timeGroups: [{ id: groupId, name: "Window", start: 2, end: 8, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "Window" } }] };
    const created = buildTypedTimeGroupProposal(document, 41, "propose_create_time_group", { name: " Setup ", startCycle: 10, endCycle: 15, comment: "stable interval" });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal.commands).toEqual([expect.objectContaining({ type: "timeGroup.create", timeGroup: expect.objectContaining({ name: "Setup", start: 10, end: 15, comment: "stable interval", presentation: { collapsed: false, foldStyle: "none" } }) })]);
    const updated = buildTypedTimeGroupProposal(document, 41, "propose_update_time_group", { timeGroupId: groupId, startCycle: 3, endCycle: 9 });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.proposal.commands).toEqual([expect.objectContaining({ type: "timeGroup.update", timeGroupId: groupId, name: "Window", start: 3, end: 9, presentation: document.timeGroups[0]!.presentation })]);
    const deleted = buildTypedTimeGroupProposal(document, 41, "propose_delete_time_group", { timeGroupId: groupId });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal.commands).toEqual([expect.objectContaining({ type: "timeGroup.delete", timeGroupId: groupId })]);
    expect(buildTypedTimeGroupProposal(document, 41, "propose_create_time_group", { name: "Bad", startCycle: 8, endCycle: 8 })).toMatchObject({ ok: false, message: expect.stringContaining("source-cycle boundaries") });
    expect(buildTypedTimeGroupProposal(document, 41, "propose_update_time_group", { timeGroupId: "missing", name: "X" })).toMatchObject({ ok: false, message: expect.stringContaining("does not exist") });
    expect(buildTypedTimeGroupProposal(document, 41, "propose_update_time_group", { timeGroupId: groupId })).toMatchObject({ ok: false, message: expect.stringContaining("at least one changed field") });
  });

  it("maps Phase and linked-Signal proposals through stable Transaction/Signal IDs", () => {
    const base = canonicalFixture();
    const document = { ...base, transactions: [{ id: "transaction_1" as TransactionId, name: "Read", start: 1, end: 7, phases: [{ id: "phase_address" as TransactionPhaseId, name: "Address", start: 1, end: 3 }, { id: "phase_data" as TransactionPhaseId, name: "Data", start: 3, end: 6 }], linkedSignals: ["sig_clk" as SignalId] }] };
    const added = buildTypedTransactionProposal(document, 32, "propose_add_phase", { transactionId: "transaction_1", name: "Response", startCycle: 6, endCycle: 7 });
    expect(added.ok).toBe(true);
    if (added.ok) expect(added.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.phaseAdd", transactionId: "transaction_1", phase: expect.objectContaining({ name: "Response", start: 6, end: 7, id: expect.stringMatching(/^transactionPhase_/) }) })]);
    const updated = buildTypedTransactionProposal(document, 32, "propose_update_phase", { transactionId: "transaction_1", phaseId: "phase_data", name: "Payload", startCycle: 3, endCycle: 5 });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.phaseUpdate", transactionId: "transaction_1", phaseIndex: 1, phase: { id: "phase_data", name: "Payload", start: 3, end: 5 } })]);
    const deleted = buildTypedTransactionProposal(document, 32, "propose_delete_phase", { transactionId: "transaction_1", phaseId: "phase_address" });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.phaseDelete", transactionId: "transaction_1", phaseIndex: 0 })]);
    const linked = buildTypedTransactionProposal(document, 32, "propose_link_signal", { transactionId: "transaction_1", signalId: "sig_data" });
    expect(linked.ok).toBe(true);
    if (linked.ok) expect(linked.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.linkSignal", transactionId: "transaction_1", signalId: "sig_data" })]);
    const unlinked = buildTypedTransactionProposal(document, 32, "propose_unlink_signal", { transactionId: "transaction_1", signalId: "sig_clk" });
    expect(unlinked.ok).toBe(true);
    if (unlinked.ok) expect(unlinked.proposal.commands).toEqual([expect.objectContaining({ type: "transaction.unlinkSignal", transactionId: "transaction_1", signalId: "sig_clk" })]);
    expect(buildTypedTransactionProposal(document, 32, "propose_link_signal", { transactionId: "transaction_1", signalId: "missing" })).toMatchObject({ ok: false, message: "Signal 'missing' does not exist in the current document." });
    expect(buildTypedTransactionProposal(document, 32, "propose_update_phase", { transactionId: "transaction_1", phaseId: "missing", name: "Bad", startCycle: 2, endCycle: 4 })).toMatchObject({ ok: false, message: expect.stringContaining("requires a stable phaseId") });
  });

  it("builds one revisioned Transaction+Phases+Signals proposal and commits it atomically as one History entry", () => {
    const base = canonicalFixture();
    const document = { ...base, timeline: { ...base.timeline, end: 50, cycleCount: 50 } };
    const input = { name: "MCP_READ", start: 10, end: 40, phases: [{ name: "Address", start: 10, end: 16 }, { name: "Data", start: 16, end: 32 }, { name: "Response", start: 32, end: 40 }], linkedSignalIds: ["sig_clk", "sig_data"] };
    const built = buildTypedTransactionProposal(document, 31, "propose_create_transaction", input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.proposal.baseRevision).toBe(31);
    expect(built.proposal.commands).toHaveLength(6);
    expect(built.proposal.summary).toContain("3 Phases and 2 linked Signals");
    const session = new CommandHistorySession(document);
    const before = JSON.stringify(session.getSnapshot().document);
    const applied = session.executeBatch("cmd_ai_transaction_bundle" as CommandId, built.proposal.commands);
    expect(applied.ok).toBe(true);
    expect(session.historyState()).toMatchObject({ undoDepth: 1, dirty: true });
    const created = session.getSnapshot().document.transactions.find((transaction) => transaction.name === "MCP_READ");
    expect(created).toMatchObject({ start: 10, end: 40, phases: input.phases, linkedSignals: input.linkedSignalIds });
    expect(session.undo().ok).toBe(true);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });

    const invalidCommands = built.proposal.commands.map((item, index) => index === built.proposal.commands.length - 1 ? { ...item, signalId: "missing_signal" } as SemanticCommand : item);
    const rejected = new CommandHistorySession(document);
    const rejectedBaseline = rejected.getSnapshot();
    expect(rejected.executeBatch("cmd_ai_transaction_invalid_bundle" as CommandId, invalidCommands)).toMatchObject({ ok: false, reason: "invalid" });
    expect(rejected.getSnapshot()).toBe(rejectedBaseline);
    expect(rejected.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
    expect(buildTypedTransactionProposal(document, 31, "propose_create_transaction", { ...input, phases: [...input.phases, { name: "Overlap", start: 15, end: 18 }] })).toEqual({ ok: false, message: "Transaction Phases must not overlap." });
    expect(buildTypedTransactionProposal(document, 31, "propose_create_transaction", { ...input, color: "purple" })).toEqual({ ok: false, message: "color must be a six-digit hexadecimal color." });
  });

  it("maps typed Bookmark proposals to existing Bookmark SemanticCommands", () => {
    const base = canonicalFixture();
    const document = { ...base, bookmarks: [{ id: "bookmark_1" as never, name: "Start", start: 2, comment: "preserve me" }] };
    const created = buildTypedBookmarkProposal(document, 24, "propose_create_bookmark", { name: " Middle ", cycle: 4, comment: "phase boundary" });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal.commands).toEqual([expect.objectContaining({ type: "bookmark.create", bookmark: expect.objectContaining({ name: "Middle", start: 4, comment: "phase boundary" }) })]);
    const moved = buildTypedBookmarkProposal(document, 24, "propose_move_bookmark", { bookmarkId: "bookmark_1", cycle: 5 });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.proposal.commands).toEqual([expect.objectContaining({ type: "bookmark.move", bookmarkId: "bookmark_1", start: 5 })]);
    const updated = buildTypedBookmarkProposal(document, 24, "propose_update_bookmark", { bookmarkId: "bookmark_1", name: "Release" });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.proposal.commands).toEqual([expect.objectContaining({ type: "bookmark.update", bookmarkId: "bookmark_1", name: "Release", start: 2, comment: "preserve me" })]);
    const deleted = buildTypedBookmarkProposal(document, 24, "propose_delete_bookmark", { bookmarkId: "bookmark_1" });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal.commands).toEqual([expect.objectContaining({ type: "bookmark.delete", bookmarkId: "bookmark_1" })]);
    expect(buildTypedBookmarkProposal(document, 24, "propose_move_bookmark", { bookmarkId: "missing", cycle: 1 })).toEqual({ ok: false, message: "Bookmark 'missing' does not exist in the current document." });
    expect(buildTypedBookmarkProposal(document, 24, "propose_update_bookmark", { bookmarkId: "bookmark_1" })).toEqual({ ok: false, message: "propose_update_bookmark requires at least one changed field." });
  });

  it("maps typed Annotation create/update/delete to stable-ID SemanticCommands and rejects invalid source ranges", () => {
    const base = canonicalFixture();
    const document = { ...base, annotations: [{ id: "annotation_1" as AnnotationId, type: "text" as const, label: "Note", visible: true, color: "#d04a36", anchor: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" as const } }] };
    const created = buildTypedAnnotationProposal(document, 25, "propose_create_annotation", { type: "range", signalId: "sig_data", start: 2, end: 5, label: "Window" });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal).toMatchObject({ baseRevision: 25, commands: [expect.objectContaining({ type: "annotation.create", annotation: expect.objectContaining({ type: "range", label: "Window", start: { signalId: "sig_data", cycle: 2, point: "cycle-start" }, end: { signalId: "sig_data", cycle: 4, point: "cycle-end" } }) })] });

    const updated = buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "annotation_1", visible: false, color: "#112233" });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.proposal.commands).toEqual([expect.objectContaining({ type: "annotation.updateProperties", annotationId: "annotation_1", label: "Note", visible: false, color: "#112233" })]);
    const anchorUpdate = buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "annotation_1", anchorField: "anchor", anchorCycle: 4, anchorSignalId: "sig_clk", anchorPoint: "cycle-center" });
    expect(anchorUpdate.ok).toBe(true);
    if (anchorUpdate.ok) expect(anchorUpdate.proposal.commands).toEqual([expect.objectContaining({ type: "annotation.setAnchor", annotationId: "annotation_1", field: "anchor", anchor: { signalId: "sig_clk", cycle: 4, point: "cycle-center" } })]);
    const combinedUpdate = buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "annotation_1", label: "Moved note", anchorField: "anchor", anchorCycle: 4 });
    expect(combinedUpdate.ok).toBe(true);
    if (combinedUpdate.ok) expect(combinedUpdate.proposal.commands.map((item) => item.type)).toEqual(["annotation.updateProperties", "annotation.setAnchor"]);
    const deleted = buildTypedAnnotationProposal(document, 27, "propose_delete_annotation", { annotationId: "annotation_1" });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.proposal.commands).toEqual([expect.objectContaining({ type: "annotation.delete", annotationId: "annotation_1" })]);
    expect(buildTypedAnnotationProposal(document, 25, "propose_create_annotation", { type: "range", signalId: "missing", start: 2, end: 5 })).toEqual({ ok: false, message: "Signal 'missing' does not exist in the current document." });
    expect(buildTypedAnnotationProposal(document, 25, "propose_create_annotation", { type: "range", signalId: "sig_data", start: 2, end: 99 })).toEqual({ ok: false, message: "propose_create_annotation requires integer source-cycle boundaries within the timeline with end > start." });
    expect(buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "missing", label: "X" })).toEqual({ ok: false, message: "Annotation 'missing' does not exist in the current document." });
    expect(buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "annotation_1", color: "red" })).toEqual({ ok: false, message: "color must be a six-digit hexadecimal color." });
    expect(buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "annotation_1", anchorCycle: 99, anchorField: "anchor" })).toMatchObject({ ok: false, message: expect.stringContaining("within the timeline") });
    expect(buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "annotation_1", anchorSignalId: "missing", anchorField: "anchor" })).toMatchObject({ ok: false, message: expect.stringContaining("does not exist") });
    expect(buildTypedAnnotationProposal(document, 26, "propose_update_annotation", { annotationId: "annotation_1", anchorCycle: 2 })).toMatchObject({ ok: false, message: expect.stringContaining("require anchorField") });
    expect(document.annotations[0]).toMatchObject({ label: "Note", visible: true, color: "#d04a36" });
  });

  it("creates typed Measurement proposals with the selected profile and semantic threshold/ratio anchors", () => {
    const document = canonicalFixture();
    const standard = buildTypedAnnotationProposal(document, 31, "propose_create_annotation", {
      type: "measurement", signalId: "sig_data", start: 2, end: 6,
      measurement: { profile: "10-90", anchorKind: "ratio" },
    });
    expect(standard.ok).toBe(true);
    if (standard.ok) expect(standard.proposal.commands[0]).toMatchObject({
      type: "annotation.create",
      annotation: {
        type: "measurement",
        measurement: { profile: "10-90", anchorKind: "ratio" },
        start: { signalId: "sig_data", cycle: 2, point: "transition-center", transition: { kind: "ratio", value: 0.1 } },
        end: { signalId: "sig_data", cycle: 5, point: "transition-center", transition: { kind: "ratio", value: 0.9 } },
      },
    });

    const custom = buildTypedAnnotationProposal(document, 32, "propose_create_annotation", {
      type: "measurement", signalId: "sig_data", start: 2, end: 6,
      measurement: { profile: "custom", anchorKind: "threshold", startValue: 0.2, endValue: 0.8 },
    });
    expect(custom.ok).toBe(true);
    if (custom.ok) expect(custom.proposal.commands[0]).toMatchObject({
      type: "annotation.create",
      annotation: {
        measurement: { profile: "custom", anchorKind: "threshold" },
        start: { transition: { kind: "threshold", value: 0.2 } },
        end: { transition: { kind: "threshold", value: 0.8 } },
      },
    });

    expect(buildTypedAnnotationProposal(document, 33, "propose_create_annotation", {
      type: "measurement", signalId: "sig_data", start: 2, end: 6,
      measurement: { profile: "custom", anchorKind: "ratio", startValue: 0.9, endValue: 0.2 },
    })).toMatchObject({ ok: false, message: expect.stringContaining("startValue <= endValue") });
    expect(buildTypedAnnotationProposal(document, 34, "propose_create_annotation", {
      type: "range", signalId: "sig_data", start: 2, end: 6,
      measurement: { profile: "10-90", anchorKind: "ratio" },
    })).toMatchObject({ ok: false, message: expect.stringContaining("only valid") });
    expect(document.annotations).toHaveLength(0);
  });

  it("updates existing Measurement semantics through annotation.updateMeasurement", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      annotations: [{ id: "measurement_existing" as AnnotationId, type: "measurement" as const, label: "Rise", visible: true, measurement: { profile: "cycle" as const, anchorKind: "threshold" as const }, start: { signalId: "sig_data" as SignalId, cycle: 2, point: "cycle-start" as const }, end: { signalId: "sig_data" as SignalId, cycle: 5, point: "cycle-end" as const } }],
    };
    const custom = buildTypedAnnotationProposal(document, 42, "propose_update_annotation", { annotationId: "measurement_existing", measurement: { profile: "custom", anchorKind: "ratio", startValue: 0.2, endValue: 0.8 } });
    expect(custom.ok).toBe(true);
    if (custom.ok) expect(custom.proposal.commands).toEqual([expect.objectContaining({ type: "annotation.updateMeasurement", annotationId: "measurement_existing", profile: "custom", anchorKind: "ratio", start: 0.2, end: 0.8 })]);
    const cycle = buildTypedAnnotationProposal(document, 42, "propose_update_annotation", { annotationId: "measurement_existing", measurement: { profile: "cycle" } });
    expect(cycle.ok).toBe(true);
    if (cycle.ok) expect(cycle.proposal.commands[0]).toMatchObject({ type: "annotation.updateMeasurement", profile: "cycle" });
    expect(buildTypedAnnotationProposal(document, 42, "propose_update_annotation", { annotationId: "measurement_existing", measurement: { profile: "custom", anchorKind: "ratio", startValue: 0.9, endValue: 0.1 } })).toMatchObject({ ok: false, message: expect.stringContaining("startValue <= endValue") });
    const nonMeasurement = { ...base, annotations: [{ id: "annotation_text" as AnnotationId, type: "text" as const, label: "Note", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" as const } }] };
    expect(buildTypedAnnotationProposal(nonMeasurement, 42, "propose_update_annotation", { annotationId: "annotation_text", measurement: { profile: "10-90" } })).toMatchObject({ ok: false, message: expect.stringContaining("only valid") });
  });

  it("creates Ghost Trace proposals with an independently selected stable source Signal and validates semantics", () => {
    const document = canonicalFixture();
    const result = buildTypedAnnotationProposal(document, 35, "propose_create_annotation", {
      type: "ghostTrace", signalId: "sig_data", start: 2, end: 6, label: "Previous request",
      ghostTrace: { sourceSignalId: "sig_clk", traceOffsetCycles: -3, opacity: 0.4 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.commands[0]).toMatchObject({
      type: "annotation.create",
      annotation: {
        type: "ghostTrace", label: "Previous request", sourceSignalId: "sig_clk", traceOffsetCycles: -3, opacity: 0.4,
        start: { signalId: "sig_data", cycle: 2 }, end: { signalId: "sig_data", cycle: 5 },
      },
    });
    expect(buildTypedAnnotationProposal(document, 36, "propose_create_annotation", {
      type: "ghostTrace", signalId: "sig_data", start: 2, end: 6,
      ghostTrace: { sourceSignalId: "missing_signal" },
    })).toMatchObject({ ok: false, message: expect.stringContaining("does not exist") });
    expect(buildTypedAnnotationProposal(document, 37, "propose_create_annotation", {
      type: "ghostTrace", signalId: "sig_data", start: 2, end: 6,
      ghostTrace: { traceOffsetCycles: Number.NaN },
    })).toMatchObject({ ok: false, message: expect.stringContaining("must be finite") });
    expect(buildTypedAnnotationProposal(document, 38, "propose_create_annotation", {
      type: "ghostTrace", signalId: "sig_data", start: 2, end: 6,
      ghostTrace: { opacity: 1.1 },
    })).toMatchObject({ ok: false, message: expect.stringContaining("between 0 and 1") });
    expect(document.annotations).toHaveLength(0);

    const existingGhost = {
      ...document,
      annotations: [{ id: "annotation_ghost" as AnnotationId, type: "ghostTrace" as const, label: "Old", visible: true, sourceSignalId: "sig_clk" as SignalId, traceOffsetCycles: 0, opacity: 0.55, start: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" as const }, end: { signalId: "sig_data" as SignalId, cycle: 3, point: "cycle-end" as const } }],
    };
    const update = buildTypedAnnotationProposal(existingGhost, 39, "propose_update_annotation", { annotationId: "annotation_ghost", sourceSignalId: "sig_data", traceOffsetCycles: 2.5, opacity: 0.25 });
    expect(update.ok).toBe(true);
    if (update.ok) expect(update.proposal.commands[0]).toMatchObject({ type: "annotation.updateProperties", annotationId: "annotation_ghost", sourceSignalId: "sig_data", traceOffsetCycles: 2.5, opacity: 0.25 });
    expect(buildTypedAnnotationProposal(existingGhost, 40, "propose_update_annotation", { annotationId: "annotation_ghost", sourceSignalId: "missing_signal" })).toMatchObject({ ok: false, message: expect.stringContaining("does not exist") });
    expect(buildTypedAnnotationProposal(existingGhost, 41, "propose_update_annotation", { annotationId: "annotation_ghost", opacity: 1.1 })).toMatchObject({ ok: false, message: expect.stringContaining("between 0 and 1") });
  });

  it("returns a revisioned semantic proposal without mutating the source document", () => {
    const document = canonicalFixture();
    const result = deterministicMockAIProposalProvider.propose({ document, revision: 7, query: "rename selected signal to DATA_RENAMED", selectedSignalId: "sig_data" as never });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal).toMatchObject({ kind: "semantic-command", baseRevision: 7, summary: "Rename DATA to DATA_RENAMED" });
    expect(result.proposal.commands[0]).toMatchObject({ type: "signal.rename", signalId: "sig_data", name: "DATA_RENAMED" });
    expect(document.signals[1]).toMatchObject({ id: "sig_data", name: "DATA" });
  });

  it("rejects unsupported provider intents and missing scope deterministically", () => {
    const document = canonicalFixture();
    expect(deterministicMockAIProposalProvider.propose({ document, revision: 0, query: "make it faster", selectedSignalId: "sig_data" as never })).toEqual({ ok: false, message: expect.stringContaining("Supported intents") });
    expect(deterministicMockAIProposalProvider.propose({ document, revision: 0, query: "hide selected signal", selectedSignalId: undefined })).toEqual({ ok: false, message: "Select a timing Signal first." });
  });

  it("maps each supported operation domain to a typed SemanticCommand", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      signalGroups: [...base.signalGroups, { id: "grp_aux" as GroupId, name: "Aux", rows: [] }],
      bookmarks: [{ id: "bookmark_1" as never, name: "B", start: 2 }],
      timeGroups: [{ id: "time_1" as TimeGroupId, name: "TG", start: 1, end: 3 }],
      annotations: [{ id: "annotation_1" as AnnotationId, type: "text" as const, label: "Note", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" as const } }],
      transactions: [{ id: "transaction_1" as TransactionId, name: "Read", start: 1, end: 3 }],
    };
    const request = (query: string, extra: Record<string, unknown> = {}) => deterministicMockAIProposalProvider.propose({
      document,
      revision: 4,
      query,
      selectedSignalId: "sig_data" as SignalId,
      selectedGroupId: "grp_main" as GroupId,
      selectedAnnotationId: "annotation_1",
      selectedTransactionId: "transaction_1",
      range: { start: 1, end: 3 },
      ...extra,
    });
    const typed = (query: string, type: string, extra?: Record<string, unknown>) => {
      const result = request(query, extra);
      expect(result.ok, query).toBe(true);
      if (result.ok) expect(result.proposal.commands[0]?.type, query).toBe(type);
    };

    typed("create binary signal named READY", "signal.create");
    typed("set selected signal role to output", "signal.updateProperties");
    typed("set selected signal color to #112233", "signal.updateProperties");
    typed("move selected signal to group Aux", "signal.move");
    typed("create group named Status", "group.create");
    typed("move selected group to position 1", "group.move");
    typed("insert 1 cycle at 2", "timeline.insert");
    typed("delete cycles 2 to 3", "timeline.delete");
    typed("duplicate cycles 1 to 2 at 4", "timeline.duplicateRange");
    typed("move cycles 1 to 2 to 4", "timeline.moveRange");
    typed("add bookmark at 4", "bookmark.create");
    typed("move bookmark B to 4", "bookmark.move");
    typed("rename bookmark B to Release", "bookmark.update");
    typed("create time group Window from 1 to 3", "timeGroup.create");
    typed("update time group TG from 2 to 4", "timeGroup.update");
    typed("create text annotation", "annotation.create");
    typed("rename selected annotation to Updated Note", "annotation.updateProperties");
    typed("create transaction Write from 2 to 4", "transaction.create");
    typed("rename selected transaction to Updated Read", "transaction.rename");
    const view = request("fit all");
    expect(view).toMatchObject({ ok: true, proposal: { kind: "view-only", viewIntent: "fit-all", commands: [] } });
  });

  it("requires explicit group scope for AI signal creation", () => {
    const document = canonicalFixture();
    const result = deterministicMockAIProposalProvider.propose({ document, revision: 0, query: "create signal named ORPHAN", selectedSignalId: undefined });
    expect(result).toEqual({ ok: false, message: "A Signal Group is required." });
  });
});
