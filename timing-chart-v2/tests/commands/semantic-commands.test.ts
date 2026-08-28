import { describe, expect, it } from "vitest";
import { planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { AnnotationId, CommandId, CommentRow, GroupId, Signal, SignalId, SpacerId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function extraSignal(id = "sig_extra"): Signal {
  const base = clone(canonicalFixture().signals[1]!);
  return { ...base, id: id as SignalId, name: "EXTRA", source: { ...base.source, signalName: "EXTRA" }, display: { ...base.display, name: "EXTRA" } } as Signal;
}

describe("pure Semantic Command planning", () => {
  it("replaces a validated JSON document as one canonical operation", () => {
    const source = canonicalFixture();
    const next = { ...source, document: { ...source.document, title: "JSON Edited" } };
    const plan = planCommand(source, { id: commandId("cmd_json_replace"), type: "document.replace", document: next });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.changeSet).toMatchObject({ fullDocumentReplace: true, timelineSemantics: true });
    const session = new CommandHistorySession(source);
    expect(session.execute({ id: commandId("cmd_json_replace_execute"), type: "document.replace", document: next }).ok).toBe(true);
    expect(session.getSnapshot().document.document.title).toBe("JSON Edited");
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.document.title).toBe(source.document.title);
  });

  it("updates Header and Footer metadata as one non-waveform operation", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const result = session.execute({ id: commandId("cmd_metadata"), type: "document.updateMetadata", title: "Timing Review", header: { ...source.document.header, subtitle: "Reviewed timing", constraints: ["Setup must hold"] }, footer: { ...source.document.footer, figureNumber: "Fig. 2", revision: "R3", text: "Internal review" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet).toEqual({});
    expect(session.getSnapshot().document.document).toMatchObject({ title: "Timing Review", header: { subtitle: "Reviewed timing", constraints: ["Setup must hold"] }, footer: { figureNumber: "Fig. 2", revision: "R3", text: "Internal review" } });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.document).toEqual(source.document);
  });

  it("updates global row layout with targeted screen-Y invalidation and exact Undo", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const layout = { ...source.layout, rowHeight: 36, signalSpacing: 8 };
    const result = session.execute({ id: commandId("cmd_layout"), type: "document.updateLayout", layout });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toMatchObject({ geometryScreenY: ["sig_clk", "sig_data"], minimapOverview: true });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
    expect(session.getSnapshot().document.layout).toEqual(layout);
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.layout).toEqual(source.layout);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.layout).toEqual(layout);
  });

  it("updates Legend presentation without touching waveform domains", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const result = session.execute({ id: commandId("cmd_legend"), type: "legend.update", legend: { ...source.legend, show: true, orientation: "vertical", usedRolesOnly: false } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet).toEqual({});
    expect(session.getSnapshot().document.legend).toMatchObject({ show: true, orientation: "vertical", usedRolesOnly: false });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.legend).toEqual(source.legend);
  });

  it("edits a Transaction through semantic commands and one-entry History", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const transactionId = "txn_read" as TransactionId;
    expect(session.execute({ id: commandId("cmd_txn_create"), type: "transaction.create", transaction: { id: transactionId, name: "DMA Read", start: 1, end: 4, laneId: "lane_0", linkedSignals: ["sig_data" as SignalId] } }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_move"), type: "transaction.move", transactionId, start: 2 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_resize"), type: "transaction.resize", transactionId, edge: "end", value: 7 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_lane"), type: "transaction.moveLane", transactionId, laneId: "lane_1" }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_unlink"), type: "transaction.unlinkSignal", transactionId, signalId: "sig_data" as SignalId }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ start: 2, end: 7, laneId: "lane_1", linkedSignals: [] });
    expect(session.historyState().undoDepth).toBe(5);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]?.linkedSignals).toEqual(["sig_data"]);
  });

  it("updates all Transaction inspector fields atomically", () => {
    const document = canonicalFixture();
    document.transactions = [{ id: "txn_atomic" as TransactionId, name: "Old", start: 1, end: 3, laneId: "lane_0" }];
    const session = new CommandHistorySession(document);
    const result = session.execute({ id: commandId("cmd_txn_atomic"), type: "transaction.update", transactionId: "txn_atomic" as TransactionId, name: "Updated", start: 2, end: 6, laneId: "lane_2" });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ name: "Updated", start: 2, end: 6, laneId: "lane_2" });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toEqual(document.transactions[0]);
  });

  it("creates, edits, deletes, and restores a Comment Row through explicit commands", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const commentRow: CommentRow = { id: "comment_review" as SignalId, type: "commentRow", name: "Review", role: "internal", source: { instancePath: [], signalName: "review" }, display: { name: "Review" }, title: "Review", body: "Initial" };
    expect(session.execute({ id: commandId("cmd_comment_create"), type: "commentRow.create", commentRow, targetGroupId: "grp_main" as GroupId, index: 2 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_comment_update"), type: "commentRow.update", signalId: commentRow.id, title: "Notes", body: "Updated body", spacingBefore: 3, spacingAfter: 5 }).ok).toBe(true);
    expect(session.getSnapshot().document.signals.at(-1)).toMatchObject({ title: "Notes", body: "Updated body", spacingBefore: 3, spacingAfter: 5, display: { name: "Notes" } });
    expect(session.execute({ id: commandId("cmd_comment_delete"), type: "commentRow.delete", signalId: commentRow.id }).ok).toBe(true);
    expect(session.historyState().undoDepth).toBe(3);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.at(-1)).toMatchObject({ id: commentRow.id, title: "Notes" });
  });

  it("rejects an empty-title Comment Row update atomically, leaving document and History untouched", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const commentRow: CommentRow = { id: "comment_atomic" as SignalId, type: "commentRow", name: "Note", role: "internal", source: { instancePath: [], signalName: "note" }, display: { name: "Note" }, title: "Note", body: "Body" };
    expect(session.execute({ id: commandId("cmd_comment_create_reject"), type: "commentRow.create", commentRow, targetGroupId: "grp_main" as GroupId, index: 2 }).ok).toBe(true);
    const before = session.getSnapshot();
    const result = session.execute({ id: commandId("cmd_comment_reject"), type: "commentRow.update", signalId: commentRow.id, title: "   ", body: "Changed" });
    expect(result.ok).toBe(false);
    expect(session.getSnapshot().document).toBe(before.document);
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("unlinks deleted Signals while retaining their Transactions", () => {
    const document = { ...canonicalFixture(), transactions: [{ id: "txn_link" as TransactionId, name: "Linked", start: 1, end: 3, linkedSignals: ["sig_data" as SignalId] }] };
    const plan = planCommand(document, { id: commandId("cmd_delete_linked"), type: "signal.delete", signalId: "sig_data" as SignalId });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.document.transactions).toEqual([{ id: "txn_link", name: "Linked", start: 1, end: 3, linkedSignals: [] }]);
  });
  it("plans one-signal edits without mutating the source", () => {
    const source = canonicalFixture();
    const before = JSON.stringify(source);
    const plan = planCommand(source, { id: commandId("cmd_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" });
    expect(plan.ok).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    if (!plan.ok) return;
    expect(plan.changeSet).toMatchObject({ waveSemantics: ["sig_data"], geometryLocal: ["sig_data"], geometryScreenX: true });
    expect(plan.changeSet.rowOrder).toBeUndefined();
  });

  it("keeps reorder and visibility out of WaveDrom and Local Geometry domains", () => {
    const source = canonicalFixture();
    const reorder = planCommand(source, { id: commandId("cmd_move"), type: "signal.move", signalId: "sig_data" as SignalId, targetGroupId: "grp_main" as GroupId, index: 0 });
    expect(reorder.ok).toBe(true);
    if (reorder.ok) {
      expect(reorder.document.signalGroups[0]?.rows).toEqual(["sig_data", "sig_clk"]);
      expect(reorder.changeSet.waveSemantics).toBeUndefined();
      expect(reorder.changeSet.geometryLocal).toBeUndefined();
      expect(reorder.changeSet).toMatchObject({ rowOrder: ["sig_clk", "sig_data"], geometryScreenY: ["sig_clk", "sig_data"] });
    }
    const visibility = planCommand(source, { id: commandId("cmd_hide"), type: "signal.setVisibility", signalId: "sig_data" as SignalId, visible: false });
    expect(visibility.ok).toBe(true);
    if (visibility.ok) {
      expect(visibility.changeSet.waveSemantics).toBeUndefined();
      expect(visibility.changeSet.geometryLocal).toBeUndefined();
      expect(visibility.changeSet.rowPresentation).toEqual(["sig_data"]);
    }
  });

  it("plans Signal Editor changes with precise render domains", () => {
    const source = canonicalFixture();
    const moved = planCommand(source, { id: commandId("cmd_move_value"), type: "signal.moveValue", signalId: "sig_data" as SignalId, fromStart: 4, toStart: 3 });
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect((moved.document.signals[1] as Extract<Signal, { values: unknown }>).values.map((change) => change.start)).toEqual([0, 3]);
      expect(moved.changeSet).toMatchObject({ waveSemantics: ["sig_data"], geometryLocal: ["sig_data"] });
    }
    const replaced = planCommand(source, { id: commandId("cmd_replace_value"), type: "signal.replaceValue", signalId: "sig_data" as SignalId, fromStart: 4, start: 3, value: "0F", comment: "edited" });
    expect(replaced.ok).toBe(true);
    if (replaced.ok) expect((replaced.document.signals[1] as Extract<Signal, { values: unknown }>).values[1]).toEqual({ start: 3, value: "0F", comment: "edited" });
    const formatted = planCommand(source, { id: commandId("cmd_format"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA_OUT", role: "output", displayFormat: "binary" });
    expect(formatted.ok).toBe(true);
    if (formatted.ok) {
      expect(formatted.document.signals[1]).toMatchObject({ name: "DATA_OUT", role: "output", displayFormat: "binary", display: { name: "DATA_OUT" } });
      expect(formatted.changeSet).toMatchObject({ rowPresentation: ["sig_data"], waveSemantics: ["sig_data"] });
    }
    const inspectorProperties = planCommand(source, { id: commandId("cmd_inspector_properties"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA_INSPECTED", role: "output", signalType: "bus", width: 16, displayFormat: "binary", visible: false, displayAlign: "center", displayOverflow: "wrap", displayStyle: { color: "#114477" } });
    expect(inspectorProperties.ok).toBe(true);
    if (inspectorProperties.ok) {
      expect(inspectorProperties.document.signals[1]).toMatchObject({ name: "DATA_INSPECTED", role: "output", type: "bus", width: 16, displayFormat: "binary", display: { name: "DATA_INSPECTED", visible: false, align: "center", overflow: "wrap", style: { color: "#114477" } } });
      expect(inspectorProperties.changeSet).toMatchObject({ rowPresentation: ["sig_data"], waveSemantics: ["sig_data"], geometryLocal: ["sig_data"] });
    }
    const spacing = planCommand(source, { id: commandId("cmd_signal_spacing"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA", role: "output", spacingBefore: 3, spacingAfter: 5 });
    expect(spacing.ok).toBe(true);
    if (spacing.ok) {
      expect(spacing.document.signals[1]).toMatchObject({ spacingBefore: 3, spacingAfter: 5 });
      expect(spacing.changeSet).toMatchObject({ rowPresentation: ["sig_data"], geometryScreenY: ["sig_data"] });
      expect(spacing.changeSet.waveSemantics).toBeUndefined();
      expect(spacing.changeSet.geometryLocal).toBeUndefined();
    }
    const retyped = planCommand(source, { id: commandId("cmd_retype"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA", role: "internal", signalType: "binary" });
    expect(retyped.ok).toBe(true);
    if (retyped.ok) {
      expect(retyped.document.signals[1]).toMatchObject({ type: "binary" });
      expect(retyped.document.signals[1]).not.toHaveProperty("width");
      expect(retyped.document.signals[1]).not.toHaveProperty("displayFormat");
    }
    const removed = planCommand(source, { id: commandId("cmd_remove_value"), type: "signal.removeValue", signalId: "sig_data" as SignalId, start: 4 });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect((removed.document.signals[1] as Extract<Signal, { values: unknown }>).values).toHaveLength(1);
  });

  it("imports a complete event table as one semantic operation", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const before = session.metrics();
    const values = [{ start: 0, value: "0" }, { start: 2, value: "1", comment: "imported" }, { start: 6, value: "0" }];
    const result = session.execute({ id: commandId("cmd_replace_values"), type: "signal.replaceValues", signalId: "sig_data" as SignalId, values });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")?.values).toEqual(values);
    expect(session.metrics()).toEqual({ validationRuns: before.validationRuns + 1, commits: before.commits + 1 });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")?.values).toEqual(source.signals.find((signal) => signal.id === "sig_data")?.values);
  });
});

describe("command execution and atomic history", () => {
  it("performs one validation, one commit, and one history entry per accepted action", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const before = session.metrics();
    const result = session.execute({ id: commandId("cmd_create"), type: "signal.create", signal: extraSignal(), targetGroupId: "grp_main" as GroupId, index: 2 });
    expect(result.ok).toBe(true);
    expect(session.metrics()).toEqual({ validationRuns: before.validationRuns + 1, commits: before.commits + 1 });
    expect(session.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 0, dirty: true });
    if (result.ok) expect(result.changeSet).toMatchObject({ addedSignals: ["sig_extra"], rowOrder: ["sig_extra"], waveSemantics: ["sig_extra"] });
  });

  it("restores exact semantics and Dirty through Undo/Redo", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const baseline = JSON.stringify(session.getSnapshot().document);
    expect(session.execute({ id: commandId("cmd_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" }).ok).toBe(true);
    expect(session.historyState().dirty).toBe(true);
    const undo = session.undo();
    expect(undo.ok).toBe(true);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(baseline);
    expect(session.historyState()).toMatchObject({ canUndo: false, canRedo: true, dirty: false });
    const redo = session.redo();
    expect(redo.ok).toBe(true);
    expect(session.historyState()).toMatchObject({ canUndo: true, canRedo: false, dirty: true });
  });

  it("atomically rejects invalid and no-op commands without changing state or Redo", () => {
    const session = new CommandHistorySession(canonicalFixture());
    expect(session.execute({ id: commandId("cmd_rename"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "RENAMED" }).ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    const before = session.getSnapshot();
    const metrics = session.metrics();
    const noOp = session.execute({ id: commandId("cmd_noop"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "DATA" });
    expect(noOp).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual(metrics);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
    const invalid = session.execute({ id: commandId("cmd_bad"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1FF" });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
    const invalidId = session.execute({ id: commandId("1 invalid"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "RENAMED" });
    expect(invalidId).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_COMMAND_ID" }] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
  });

  it("commits a valid batch once and rejects a failing batch as a whole", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const beforeMetrics = session.metrics();
    const commands: SemanticCommand[] = [
      { id: commandId("cmd_batch_rename"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "RENAMED" },
      { id: commandId("cmd_batch_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" },
    ];
    expect(session.executeBatch(commandId("cmd_batch"), commands).ok).toBe(true);
    expect(session.metrics()).toEqual({ validationRuns: beforeMetrics.validationRuns + 1, commits: beforeMetrics.commits + 1 });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals[1]).toMatchObject({ name: "DATA", values: [{ start: 0 }, { start: 4 }] });

    const beforeRejected = session.getSnapshot();
    const rejectedMetrics = session.metrics();
    const rejected: SemanticCommand[] = [
      { id: commandId("cmd_reject_rename"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "SHOULD_NOT_COMMIT" },
      { id: commandId("cmd_reject_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1FF" },
    ];
    expect(session.executeBatch(commandId("cmd_rejected_batch"), rejected)).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot()).toBe(beforeRejected);
    expect(session.metrics()).toEqual({ validationRuns: rejectedMetrics.validationRuns + 1, commits: rejectedMetrics.commits });
  });

  it("bulk-registers signals with preserved hardware paths in one history entry", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const first = extraSignal("sig_bulk_status");
    const second = { ...extraSignal("sig_bulk_data"), source: { instancePath: ["dut", "core"], signalName: "data" } } as Signal;
    const before = session.metrics();
    expect(session.execute({ id: commandId("cmd_bulk_register"), type: "signal.bulkCreate", signals: [first, second], targetGroupId: "grp_main" as GroupId, index: 2 })).toMatchObject({ ok: true });
    expect(session.metrics()).toEqual({ validationRuns: before.validationRuns + 1, commits: before.commits + 1 });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === second.id)?.source.instancePath).toEqual(["dut", "core"]);
    expect(session.undo()).toMatchObject({ ok: true });
    expect(session.getSnapshot().document.signals.some((signal) => signal.id === first.id)).toBe(false);
  });

  it("supports Group lifecycle without implicitly moving rows", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const group = { id: "grp_empty" as GroupId, name: "Empty", rows: [] };
    expect(session.execute({ id: commandId("cmd_group_create"), type: "group.create", group, index: 1 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_group_rename"), type: "group.rename", groupId: group.id, name: "Renamed" }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_group_move"), type: "group.move", groupId: group.id, index: 0 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_group_delete"), type: "group.delete", groupId: group.id }).ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups.map((item) => item.id)).toEqual(["grp_main"]);
  });

  it("supports Signal create/delete and resets the clean and Redo baselines correctly", () => {
    const session = new CommandHistorySession(canonicalFixture());
    expect(session.execute({ id: commandId("cmd_create_delete"), type: "signal.create", signal: extraSignal(), targetGroupId: "grp_main" as GroupId, index: 2 }).ok).toBe(true);
    session.markClean();
    expect(session.historyState().dirty).toBe(false);
    expect(session.execute({ id: commandId("cmd_delete"), type: "signal.delete", signalId: "sig_extra" as SignalId }).ok).toBe(true);
    expect(session.historyState().dirty).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.historyState()).toMatchObject({ canRedo: true, dirty: false });
    expect(session.execute({ id: commandId("cmd_hide_after_undo"), type: "signal.setVisibility", signalId: "sig_data" as SignalId, visible: false }).ok).toBe(true);
    expect(session.historyState()).toMatchObject({ canRedo: false, redoDepth: 0, dirty: true });
  });

  it("changes group spacing as Screen Y only and reprojects dependent Annotations", () => {
    const document = canonicalFixture();
    document.annotations = [{ id: "ann_spacing" as AnnotationId, type: "text", label: "Data", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 2, point: "value-start" } }];
    const session = new CommandHistorySession(document);
    const result = session.execute({ id: commandId("cmd_group_spacing"), type: "group.updateLayout", groupId: "grp_main" as GroupId, spacingBefore: 7, spacingAfter: 11 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toMatchObject({ geometryScreenY: ["sig_clk", "sig_data"], annotationPosition: ["ann_spacing"] });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
  });

  it("applies Group presentation properties in one canonical commit", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const result = session.execute({ id: commandId("cmd_group_properties"), type: "group.updateProperties", groupId: "grp_main" as GroupId, name: "Main Signals", spacingBefore: 3, spacingAfter: 9, style: { showBackground: true, background: "#eef5fc", opacity: 0.8, extend: "both", border: "#aaccee", showHeader: true } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toMatchObject({ geometryScreenY: ["sig_clk", "sig_data"], minimapOverview: true });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
    expect(session.getSnapshot().document.signalGroups[0]).toMatchObject({ name: "Main Signals", spacingBefore: 3, spacingAfter: 9, style: { showBackground: true, opacity: 0.8 } });
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("creates, resizes, deletes and undoes a stable Spacer row with targeted Y invalidation", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const spacerId = "spacer_test" as SpacerId;
    const created = session.execute({ id: commandId("cmd_spacer_create"), type: "spacer.create", spacer: { id: spacerId, height: 18 }, targetGroupId: "grp_main" as GroupId, index: 1 });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.changeSet).toMatchObject({ rowOrder: [spacerId], geometryScreenY: ["sig_data"], minimapOverview: true });
    expect(session.getSnapshot().document.signalGroups[0]).toMatchObject({ rows: ["sig_clk", spacerId, "sig_data"], spacers: [{ id: spacerId, height: 18 }] });
    expect(session.execute({ id: commandId("cmd_spacer_update"), type: "spacer.update", spacerId, height: 42 }).ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]?.spacers?.[0]?.height).toBe(42);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]?.spacers?.[0]?.height).toBe(18);
    expect(session.execute({ id: commandId("cmd_spacer_delete"), type: "spacer.delete", spacerId }).ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]).toMatchObject({ rows: ["sig_clk", "sig_data"] });
    expect(session.getSnapshot().document.signalGroups[0]).not.toHaveProperty("spacers");
  });

  it("updates Transaction phases atomically and rejects phases outside the transaction", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const created = session.execute({ id: commandId("cmd_txn_phase_create"), type: "transaction.create", transaction: { id: "txn_phase" as TransactionId, name: "Transfer", start: 2, end: 8 } });
    expect(created.ok).toBe(true);
    const result = session.execute({ id: commandId("cmd_txn_phase_update"), type: "transaction.update", transactionId: "txn_phase" as TransactionId, name: "Transfer", start: 2, end: 8, phases: [{ name: "Address", start: 2, end: 4 }, { name: "Data", start: 4, end: 7 }] });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]?.phases).toEqual([{ name: "Address", start: 2, end: 4 }, { name: "Data", start: 4, end: 7 }]);
    expect(session.historyState().undoDepth).toBe(2);
    const rejected = session.execute({ id: commandId("cmd_txn_phase_invalid"), type: "transaction.update", transactionId: "txn_phase" as TransactionId, name: "Transfer", start: 2, end: 8, phases: [{ name: "Bad", start: 1, end: 3 }] });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("updates Clock Edge Numbers as presentation-only state", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const result = session.execute({ id: commandId("cmd_edge_numbers"), type: "signal.updateEdgeCounter", signalId: "sig_clk" as SignalId, edgeCounter: { show: true, mode: "rising", startNumber: 4, countFrom: "signal-start", labelEvery: 2, position: "above", offset: { x: 1, y: -8 } } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toEqual({ rowPresentation: ["sig_clk"], edgeCounter: ["sig_clk"] });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
    expect(session.getSnapshot().document.signals[0]).toMatchObject({ edgeCounter: { show: true, mode: "rising", labelEvery: 2 } });
  });

  it("supports Annotation lifecycle, anchors, label offsets, and style domains", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const annotation = { id: "ann_editor" as AnnotationId, type: "arrow" as const, label: "Dependency", visible: true, from: { signalId: "sig_data" as SignalId, cycle: 2, point: "transition-center" as const }, to: { signalId: "sig_data" as SignalId, cycle: 4, point: "value-start" as const } };
    const created = session.execute({ id: commandId("cmd_ann_create"), type: "annotation.create", annotation });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.changeSet).toMatchObject({ annotationPosition: [annotation.id], annotationStyle: [annotation.id] });
    expect(session.execute({ id: commandId("cmd_ann_anchor"), type: "annotation.setAnchor", annotationId: annotation.id, field: "to", anchor: { signalId: "sig_data" as SignalId, cycle: 5, point: "cycle-center", offset: { x: 2, y: -1 } } }).ok).toBe(true);
    const moved = session.execute({ id: commandId("cmd_ann_move"), type: "annotation.translateOffsets", annotationId: annotation.id, delta: { x: 5, y: 3 } });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.changeSet).toEqual({ annotationPosition: [annotation.id] });
    expect(session.getSnapshot().document.annotations[0]).toMatchObject({ from: { cycle: 2, offset: { x: 5, y: 3 } }, to: { cycle: 5, offset: { x: 7, y: 2 } } });
    expect(session.execute({ id: commandId("cmd_ann_label"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 7, y: -9 } }).ok).toBe(true);
    const styled = session.execute({ id: commandId("cmd_ann_style"), type: "annotation.updateProperties", annotationId: annotation.id, label: "Ready", visible: true, color: "#cc3300", lineType: "orthogonal", arrowhead: "end" });
    expect(styled.ok).toBe(true);
    if (styled.ok) expect(styled.changeSet).toEqual({ annotationStyle: [annotation.id], minimapOverview: true });
    expect(session.getSnapshot().document.annotations[0]).toMatchObject({ label: "Ready", color: "#cc3300", labelOffset: { x: 7, y: -9 }, to: { cycle: 5 } });
    expect(session.execute({ id: commandId("cmd_ann_reset"), type: "annotation.resetOffsets", annotationId: annotation.id }).ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]).not.toHaveProperty("labelOffset");
    expect(session.getSnapshot().document.annotations[0]?.from).not.toHaveProperty("offset");
    expect(session.getSnapshot().document.annotations[0]?.to).not.toHaveProperty("offset");
    expect(session.execute({ id: commandId("cmd_ann_delete"), type: "annotation.delete", annotationId: annotation.id }).ok).toBe(true);
    expect(session.getSnapshot().document.annotations).toEqual([]);
  });
});
