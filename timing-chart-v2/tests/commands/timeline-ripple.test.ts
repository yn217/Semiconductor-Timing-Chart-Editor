import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { AnnotationId, BookmarkId, CommandId, LabelAnchorId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;

function rippleFixture() {
  const document = canonicalFixture();
  return {
    ...document,
    timeline: {
      ...document.timeline,
      labelAnchors: [{ id: "label_wait" as LabelAnchorId, source: 5, display: 20, ownerTimeGroupId: "time_wait" as TimeGroupId }],
    },
    bookmarks: [{ id: "bookmark_data" as BookmarkId, name: "Data", start: 4 }],
    timeGroups: [{ id: "time_wait" as TimeGroupId, name: "Wait", start: 2, end: 5, presentation: { resumeLabelAnchorId: "label_wait" as LabelAnchorId } }],
    annotations: [{ id: "ann_data" as AnnotationId, type: "text" as const, label: "Data", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 4, point: "value-start" as const } }],
    transactions: [{ id: "txn_data" as TransactionId, name: "Transfer", start: 4, end: 7, phases: [{ name: "Data", start: 4, end: 6 }] }],
  };
}

describe("timeline ripple commands", () => {
  it("inserts integer cycles and ripples all semantic owners", () => {
    const initial = rippleFixture();
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_insert"), type: "timeline.insert", at: 3, count: 2 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeline).toMatchObject({ start: 0, end: 10, cycleCount: 10 });
    expect(document.signals[1]).toMatchObject({ values: [{ start: 0 }, { start: 6 }] });
    expect(document.annotations[0]?.anchor?.cycle).toBe(6);
    expect(document.bookmarks[0]?.start).toBe(6);
    expect(document.timeGroups[0]).toMatchObject({ start: 2, end: 7 });
    expect(document.timeline.labelAnchors[0]?.source).toBe(7);
    expect(document.transactions[0]).toMatchObject({ start: 6, end: 9, phases: [{ start: 6, end: 8 }] });
    if (result.ok) expect(result.changeSet).toMatchObject({ timelineSemantics: true, geometryScreenX: true, waveSemantics: ["sig_clk", "sig_data"], annotationPosition: ["ann_data"] });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
  });

  it("deletes a half-open range and keeps change points deterministic", () => {
    const initial = rippleFixture();
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_delete"), type: "timeline.delete", start: 2, end: 4 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeline).toMatchObject({ end: 6, cycleCount: 6 });
    expect(document.signals[1]).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 2, value: "A5" }] });
    expect(document.annotations[0]?.anchor?.cycle).toBe(2);
    expect(document.bookmarks[0]?.start).toBe(2);
    expect(document.timeGroups[0]).toMatchObject({ start: 2, end: 3 });
    expect(document.transactions[0]).toMatchObject({ start: 2, end: 5, phases: [{ start: 2, end: 4 }] });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
  });

  it("rejects invalid ranges atomically", () => {
    const session = new CommandHistorySession(rippleFixture());
    const before = session.getSnapshot();
    const metrics = session.metrics();
    expect(session.execute({ id: commandId("cmd_bad_delete"), type: "timeline.delete", start: 0, end: 8 })).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual(metrics);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("removes fully deleted ranges and reports their IDs in the ChangeSet", () => {
    const initial = rippleFixture();
    initial.timeGroups[0] = { ...initial.timeGroups[0]!, start: 2, end: 4 };
    initial.timeline.labelAnchors[0] = { ...initial.timeline.labelAnchors[0]!, source: 4 };
    initial.transactions[0] = { ...initial.transactions[0]!, start: 2, end: 4, phases: [{ name: "Deleted", start: 2, end: 4 }] };
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_delete_ranges"), type: "timeline.delete", start: 2, end: 4 });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.timeGroups).toEqual([]);
    expect(session.getSnapshot().document.transactions).toEqual([]);
    expect(session.getSnapshot().document.timeline.labelAnchors[0]).not.toHaveProperty("ownerTimeGroupId");
    if (result.ok) {
      expect(result.changeSet.timeGroupSemantics).toContain("time_wait");
      expect(result.changeSet.transactionSemantics).toContain("txn_data");
    }
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
  });

  it("creates, moves, and removes timeline markers through semantic commands", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const bookmark = { id: "bookmark_phase9" as BookmarkId, name: "Review", start: 2 };
    expect(session.execute({ id: commandId("cmd_marker_create"), type: "bookmark.create", bookmark }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_marker_move"), type: "bookmark.move", bookmarkId: bookmark.id, start: 5 }).ok).toBe(true);
    expect(session.getSnapshot().document.bookmarks[0]).toMatchObject({ id: bookmark.id, start: 5 });
    expect(session.execute({ id: commandId("cmd_marker_delete"), type: "bookmark.delete", bookmarkId: bookmark.id }).ok).toBe(true);
    expect(session.getSnapshot().document.bookmarks).toEqual([]);
    expect(session.historyState().undoDepth).toBe(3);
  });

  it("updates a named Bookmark atomically and restores it with Undo", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const bookmark = { id: "bookmark_editor" as BookmarkId, name: "Review", start: 2, comment: "initial" };
    expect(session.execute({ id: commandId("cmd_bookmark_editor_create"), type: "bookmark.create", bookmark }).ok).toBe(true);
    const result = session.execute({ id: commandId("cmd_bookmark_editor_update"), type: "bookmark.update", bookmarkId: bookmark.id, name: "Release", start: 5, comment: "approved" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet).toEqual({ bookmarkPosition: [bookmark.id], minimapOverview: true });
    expect(session.getSnapshot().document.bookmarks[0]).toEqual({ id: bookmark.id, name: "Release", start: 5, comment: "approved" });
    expect(session.historyState().undoDepth).toBe(2);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.bookmarks[0]).toEqual(bookmark);
  });

  it("owns collapsed gap presentation in a canonical Time Group", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const timeGroup = { id: "time_phase9_gap" as TimeGroupId, name: "Wait", start: 2, end: 5, presentation: { collapsed: true as const, foldStyle: "axis-break" as const, foldLabel: "WAIT" } };
    const created = session.execute({ id: commandId("cmd_gap_create"), type: "timeGroup.create", timeGroup });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.changeSet).toMatchObject({ timeGroupSemantics: [timeGroup.id], geometryScreenX: true });
    expect(session.execute({ id: commandId("cmd_gap_style"), type: "timeGroup.updatePresentation", timeGroupId: timeGroup.id, presentation: { collapsed: false, foldStyle: "compact" } }).ok).toBe(true);
    expect(session.getSnapshot().document.timeGroups[0]?.presentation).toEqual({ collapsed: false, foldStyle: "compact" });
    expect(session.execute({ id: commandId("cmd_gap_delete"), type: "timeGroup.delete", timeGroupId: timeGroup.id }).ok).toBe(true);
    expect(session.getSnapshot().document.timeGroups).toEqual([]);
  });

  it("updates a Time Group editor atomically and restores it with Undo", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const timeGroup = { id: "time_editor_gap" as TimeGroupId, name: "Wait", start: 2, end: 5, comment: "initial", presentation: { collapsed: true as const, foldStyle: "axis-break" as const, foldLabel: "WAIT" } };
    expect(session.execute({ id: commandId("cmd_editor_gap_create"), type: "timeGroup.create", timeGroup }).ok).toBe(true);
    const result = session.execute({ id: commandId("cmd_editor_gap_update"), type: "timeGroup.update", timeGroupId: timeGroup.id, name: "Idle", start: 1, end: 4, comment: "updated", presentation: { collapsed: false, foldStyle: "none", foldLabel: "IDLE" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet).toMatchObject({ timeGroupSemantics: [timeGroup.id], geometryScreenX: true, waveSemantics: expect.any(Array) });
    expect(session.getSnapshot().document.timeGroups[0]).toMatchObject({ name: "Idle", start: 1, end: 4, comment: "updated", presentation: { collapsed: false, foldStyle: "none", foldLabel: "IDLE" } });
    expect(session.historyState().undoDepth).toBe(2);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.timeGroups[0]).toEqual(timeGroup);
  });

  it("duplicates cycle states and contained point owners with deterministic stable IDs", () => {
    const session = new CommandHistorySession(rippleFixture());
    const result = session.execute({ id: commandId("cmd_duplicate"), type: "timeline.duplicateRange", start: 3, end: 6, at: 1 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeline.cycleCount).toBe(11);
    expect(document.signals[1]).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 2, value: "A5" }, { start: 4, value: "00" }, { start: 7, value: "A5" }] });
    expect(document.annotations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ann_data.copy.cmd_duplicate", anchor: expect.objectContaining({ cycle: 2 }) }),
      expect.objectContaining({ id: "ann_data", anchor: expect.objectContaining({ cycle: 7 }) }),
    ]));
    expect(document.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "bookmark_data.copy.cmd_duplicate", start: 2 }),
      expect.objectContaining({ id: "bookmark_data", start: 7 }),
    ]));
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("allocates collision-free clone IDs after reload even when a command ID is reused", () => {
    const reloaded = rippleFixture();
    reloaded.annotations = [...reloaded.annotations, {
      id: "ann_data.copy.cmd_duplicate" as AnnotationId,
      type: "text",
      label: "Existing clone",
      visible: true,
      anchor: { signalId: "sig_data" as SignalId, cycle: 0, point: "value-start" },
    }];
    const session = new CommandHistorySession(reloaded);
    const result = session.execute({ id: commandId("cmd_duplicate"), type: "timeline.duplicateRange", start: 3, end: 6, at: 1 });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.annotations.map((item) => item.id)).toContain("ann_data.copy.cmd_duplicate.2");
  });

  it("moves a cycle range by permutation while preserving owner identity", () => {
    const initial = canonicalFixture();
    initial.bookmarks = [{ id: "bookmark_move" as BookmarkId, name: "Move", start: 4 }];
    initial.annotations = [{ id: "ann_move" as AnnotationId, type: "text", label: "Move", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 4, point: "value-start" } }];
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_move_range"), type: "timeline.moveRange", start: 3, end: 6, to: 0 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeline.cycleCount).toBe(8);
    expect(document.signals[1]).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 1, value: "A5" }, { start: 3, value: "00" }, { start: 6, value: "A5" }] });
    expect(document.bookmarks[0]).toMatchObject({ id: "bookmark_move", start: 1 });
    expect(document.annotations[0]).toMatchObject({ id: "ann_move", anchor: { cycle: 1 } });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
  });
});
