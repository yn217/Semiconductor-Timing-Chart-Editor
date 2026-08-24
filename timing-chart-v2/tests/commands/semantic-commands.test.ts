import { describe, expect, it } from "vitest";
import { planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CommandId, GroupId, Signal, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function extraSignal(id = "sig_extra"): Signal {
  const base = clone(canonicalFixture().signals[1]!);
  return { ...base, id: id as SignalId, name: "EXTRA", source: { ...base.source, signalName: "EXTRA" }, display: { ...base.display, name: "EXTRA" } } as Signal;
}

describe("pure Semantic Command planning", () => {
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
      expect(reorder.changeSet).toMatchObject({ rowOrder: ["sig_data"], geometryScreenY: ["sig_data"] });
    }
    const visibility = planCommand(source, { id: commandId("cmd_hide"), type: "signal.setVisibility", signalId: "sig_data" as SignalId, visible: false });
    expect(visibility.ok).toBe(true);
    if (visibility.ok) {
      expect(visibility.changeSet.waveSemantics).toBeUndefined();
      expect(visibility.changeSet.geometryLocal).toBeUndefined();
      expect(visibility.changeSet.rowPresentation).toEqual(["sig_data"]);
    }
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
});
