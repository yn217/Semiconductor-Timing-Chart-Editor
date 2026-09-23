import { describe, expect, it } from "vitest";
import { buildTypedSignalGroupProposal, buildTypedSignalProposal, buildTypedTimelineProposal, deterministicMockAIProposalProvider } from "../../apps/editor/src/ai-proposal-provider.js";
import { canonicalFixture } from "../fixtures/canonical.js";
import type { AnnotationId, GroupId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";

describe("deterministic AI proposal provider", () => {
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

  it("builds typed role/visibility proposals using the existing signal update command", () => {
    const document = canonicalFixture();
    const result = buildTypedSignalProposal(document, 13, "propose_update_signal", { signalId: "sig_data", role: "output", visible: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.commands).toEqual([expect.objectContaining({ type: "signal.updateProperties", signalId: "sig_data", name: "DATA", role: "output", visible: false })]);
    expect(buildTypedSignalProposal(document, 13, "propose_update_signal", { signalId: "sig_data" })).toEqual({ ok: false, message: "propose_update_signal requires role or visible." });
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
    expect(buildTypedTimelineProposal(document, 21, "propose_delete_cycles", { start: 5, end: 5 })).toEqual({ ok: false, message: "propose_delete_cycles requires integer boundaries within the timeline and end > start." });
    expect(document.timeline.cycleCount).toBe(canonicalFixture().timeline.cycleCount);
  });

  it("maps typed Signal Group create/rename proposals to existing Group SemanticCommands", () => {
    const document = canonicalFixture();
    const created = buildTypedSignalGroupProposal(document, 22, "propose_create_signal_group", { name: " Auxiliary " });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.proposal.commands).toEqual([expect.objectContaining({ type: "group.create", index: document.signalGroups.length, group: expect.objectContaining({ name: "Auxiliary", rows: [] }) })]);
    const renamed = buildTypedSignalGroupProposal(document, 22, "propose_rename_signal_group", { groupId: document.signalGroups[0]!.id, name: "Controls" });
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.proposal.commands).toEqual([expect.objectContaining({ type: "group.rename", groupId: document.signalGroups[0]!.id, name: "Controls" })]);
    expect(buildTypedSignalGroupProposal(document, 22, "propose_rename_signal_group", { groupId: "missing", name: "X" })).toEqual({ ok: false, message: "Signal Group 'missing' does not exist in the current document." });
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
