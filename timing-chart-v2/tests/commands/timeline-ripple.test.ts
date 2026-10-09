import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { isStableId } from "@timing-chart-v2/schema";
import type { Annotation, AnnotationGroupId, AnnotationId, BookmarkId, ClockSignal, CommandId, LabelAnchorId, SignalId, TimeGroupId, TransactionId, ValueSignal } from "@timing-chart-v2/schema";
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
    transactions: [{ id: "txn_data" as TransactionId, name: "Transfer", start: 4, end: 7, phases: [{ id: "phase_data" as import("@timing-chart-v2/schema").TransactionPhaseId, name: "Data", start: 4, end: 6 }] }],
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

  it("rejects unsupported generated-clock ripple atomically", () => {
    const initial = rippleFixture();
    const clock = initial.signals[0] as ClockSignal;
    initial.signals[0] = { ...clock, generator: { ...clock.generator, period: 2, suppressedPeriods: [1] } };
    const commands = [
      { id: commandId("cmd_clock_insert"), type: "timeline.insert" as const, at: 3, count: 1 },
      { id: commandId("cmd_clock_delete"), type: "timeline.delete" as const, start: 2, end: 3 },
      { id: commandId("cmd_clock_duplicate"), type: "timeline.duplicateRange" as const, start: 3, end: 4, at: 1 },
      { id: commandId("cmd_clock_move"), type: "timeline.moveRange" as const, start: 3, end: 4, to: 0 },
    ];
    for (const command of commands) {
      const session = new CommandHistorySession(initial);
      const before = session.getSnapshot();
      const result = session.execute(command);
      expect(result).toMatchObject({ reason: "invalid", problems: [expect.objectContaining({ code: "UNSUPPORTED_CLOCK_RIPPLE" })] });
      expect(session.getSnapshot()).toBe(before);
      expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
    }
  });

  it("allows timeline transforms for an uncontrolled periodic Clock", () => {
    const initial = canonicalFixture();
    const clock = initial.signals[0] as ClockSignal;
    initial.signals[0] = { ...clock, generator: { ...clock.generator, period: 2 } };
    const commands = [
      { id: commandId("cmd_uncontrolled_clock_insert"), type: "timeline.insert" as const, at: 3, count: 1 },
      { id: commandId("cmd_uncontrolled_clock_delete"), type: "timeline.delete" as const, start: 2, end: 3 },
      { id: commandId("cmd_uncontrolled_clock_duplicate"), type: "timeline.duplicateRange" as const, start: 3, end: 4, at: 1 },
      { id: commandId("cmd_uncontrolled_clock_move"), type: "timeline.moveRange" as const, start: 0, end: 2, to: 4 },
    ];
    for (const command of commands) {
      const session = new CommandHistorySession(initial);
      const result = session.execute(command);
      expect(result.ok).toBe(true);
      expect(session.historyState()).toMatchObject({ undoDepth: 1, dirty: true });
      expect(session.undo().ok).toBe(true);
      expect(session.getSnapshot().document).toEqual(initial);
    }
  });

  it("moves an uncontrolled Clock generator start with its source-time range", () => {
    const initial = canonicalFixture();
    const clock = initial.signals[0] as ClockSignal;
    initial.signals[0] = { ...clock, generator: { ...clock.generator, start: 0, period: 2 } };
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_move_clock_start"), type: "timeline.moveRange", start: 0, end: 2, to: 4 });
    expect(result.ok).toBe(true);
    expect((session.getSnapshot().document.signals[0] as ClockSignal).generator.start).toBe(4);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect((session.getSnapshot().document.signals[0] as ClockSignal).generator.start).toBe(4);
  });

  it("rejects a timeline transform that would make a Clock generator unrenderable", () => {
    const initial = canonicalFixture();
    const clock = initial.signals[0] as ClockSignal;
    initial.signals[0] = { ...clock, generator: { ...clock.generator, start: 4, period: 2 } };
    const commands = [
      { id: commandId("cmd_unaligned_insert"), type: "timeline.insert" as const, at: 0, count: 1 },
      { id: commandId("cmd_unaligned_delete"), type: "timeline.delete" as const, start: 0, end: 1 },
      { id: commandId("cmd_unaligned_duplicate"), type: "timeline.duplicateRange" as const, start: 0, end: 1, at: 0 },
    ];
    for (const command of commands) {
      const session = new CommandHistorySession(initial);
      const before = session.getSnapshot();
      const metrics = session.metrics();
      const result = session.execute(command);
      expect(result).toMatchObject({ reason: "invalid", problems: [expect.objectContaining({ code: "UNALIGNED_CLOCK_START" })] });
      expect(session.getSnapshot()).toBe(before);
      expect(session.metrics()).toEqual(metrics);
      expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
    }
  });

  it("keeps representable period-one and terminal append edits available", () => {
    const initial = rippleFixture();
    const clock = initial.signals[0] as ClockSignal;
    initial.signals[0] = { ...clock, generator: { ...clock.generator, period: 2 } };
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_clock_terminal_insert"), type: "timeline.insert", at: initial.timeline.cycleCount, count: 1 });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.timeline.cycleCount).toBe(initial.timeline.cycleCount + 1);
  });

  it("ripples LabelAnchor source without shifting its display label", () => {
    const commands = [
      { id: commandId("cmd_label_insert"), type: "timeline.insert" as const, at: 3, count: 2 },
      { id: commandId("cmd_label_delete"), type: "timeline.delete" as const, start: 2, end: 4 },
      { id: commandId("cmd_label_duplicate"), type: "timeline.duplicateRange" as const, start: 4, end: 6, at: 1 },
      { id: commandId("cmd_label_move"), type: "timeline.moveRange" as const, start: 0, end: 1, to: 7 },
    ];
    for (const command of commands) {
      const initial = rippleFixture();
      const before = initial.timeline.labelAnchors[0]!;
      const session = new CommandHistorySession(initial);
      const result = session.execute(command);
      expect(result.ok).toBe(true);
      const labels = session.getSnapshot().document.timeline.labelAnchors;
      expect(labels.find((label) => label.id === before.id)).toMatchObject({ display: before.display });
      expect(labels.filter((label) => label.display === before.display)).not.toHaveLength(0);
    }
  });

  it("preserves standalone LabelAnchor identity and display through exact insert/delete ripple and history", () => {
    const initial = rippleFixture();
    const anchorId = "label_wait" as LabelAnchorId;
    initial.timeGroups = [];
    initial.timeline.labelAnchors = [{ id: anchorId, source: 5, display: 20 }];
    const session = new CommandHistorySession(initial);

    const inserted = session.execute({ id: commandId("cmd_standalone_anchor_insert"), type: "timeline.insert", at: 3, count: 2 });
    expect(inserted.ok).toBe(true);
    expect(session.getSnapshot().document.timeline.labelAnchors).toEqual([{ id: anchorId, source: 7, display: 20 }]);

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.labelAnchors).toEqual([{ id: anchorId, source: 5, display: 20 }]);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.labelAnchors).toEqual([{ id: anchorId, source: 7, display: 20 }]);

    const deleted = session.execute({ id: commandId("cmd_standalone_anchor_delete"), type: "timeline.delete", start: 2, end: 4 });
    expect(deleted.ok).toBe(true);
    expect(session.getSnapshot().document.timeline.labelAnchors).toEqual([{ id: anchorId, source: 5, display: 20 }]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.labelAnchors).toEqual([{ id: anchorId, source: 7, display: 20 }]);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.labelAnchors).toEqual([{ id: anchorId, source: 5, display: 20 }]);
  });

  it("rejects a delete that would collapse distinct LabelAnchor sources", () => {
    const initial = rippleFixture();
    initial.timeline.labelAnchors = [
      { id: "label_first" as LabelAnchorId, source: 3, display: 30 },
      { id: "label_second" as LabelAnchorId, source: 4, display: 40 },
    ];
    initial.timeGroups = [];
    const session = new CommandHistorySession(initial);
    const before = session.getSnapshot();
    const result = session.execute({ id: commandId("cmd_delete_label_collision"), type: "timeline.delete", start: 2, end: 5 });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "LABEL_ANCHOR_COLLISION", path: "$.timeline.labelAnchors" })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("removes fully deleted ranges and reports their IDs in the ChangeSet", () => {
    const initial = rippleFixture();
    initial.timeGroups[0] = { ...initial.timeGroups[0]!, start: 2, end: 4 };
    initial.timeline.labelAnchors[0] = { ...initial.timeline.labelAnchors[0]!, source: 4 };
    initial.transactions[0] = { ...initial.transactions[0]!, start: 2, end: 4, phases: [{ id: "phase_deleted" as import("@timing-chart-v2/schema").TransactionPhaseId, name: "Deleted", start: 2, end: 4 }] };
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

  it("applies explicit annotation deletion policy and repairs annotation-group membership", () => {
    const initial = canonicalFixture();
    const point: Annotation = { id: "ann_point" as AnnotationId, type: "marker", label: "Point", visible: true, anchor: { cycle: 3, point: "cycle-start" } };
    const range: Annotation = { id: "ann_range" as AnnotationId, type: "range", label: "Range", visible: true, start: { cycle: 2, point: "cycle-start" }, end: { cycle: 3, point: "cycle-end" } };
    const dependency: Annotation = { id: "ann_dependency" as AnnotationId, type: "dependency", label: "Dependency", visible: true, from: { cycle: 2, point: "cycle-start" }, to: { cycle: 3, point: "cycle-end" }, lineType: "straight", arrowhead: "end" };
    initial.annotations = [point, range, dependency];
    initial.annotationGroups = [{ id: "ann_group" as AnnotationGroupId, name: "Timing", annotationIds: [point.id, range.id, dependency.id] }];
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_delete_annotation_policy"), type: "timeline.delete", start: 2, end: 4 });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.annotations).toEqual([{ ...point, anchor: { ...point.anchor, cycle: 2 } }]);
    expect(session.getSnapshot().document.annotationGroups).toEqual([{ id: "ann_group", name: "Timing", annotationIds: [point.id] }]);
    if (result.ok) expect(result.changeSet.annotationGroups).toEqual(["ann_group"]);
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

  it("removes an owned resume anchor with its Time Group while retaining standalone anchors", () => {
    const source = canonicalFixture();
    const groupId = "time_owned_delete" as TimeGroupId;
    const ownedId = "label_owned_delete" as LabelAnchorId;
    const standaloneId = "label_standalone" as LabelAnchorId;
    source.timeGroups = [{ id: groupId, name: "Fold", start: 2, end: 5, presentation: { collapsed: true, foldStyle: "axis-break", resumeLabelAnchorId: ownedId } }];
    source.timeline = { ...source.timeline, labelAnchors: [{ id: ownedId, source: 5, display: 50, ownerTimeGroupId: groupId }, { id: standaloneId, source: 7, display: 70 }] };
    const session = new CommandHistorySession(source);
    expect(session.execute({ id: commandId("cmd_owned_delete"), type: "timeGroup.delete", timeGroupId: groupId }).ok).toBe(true);
    expect(session.getSnapshot().document.timeline.labelAnchors).toEqual([{ id: standaloneId, source: 7, display: 70 }]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(source);
    expect(session.redo().ok).toBe(true);
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

  it("duplicates cycle states and contained point owners with deterministic opaque IDs", () => {
    const session = new CommandHistorySession(rippleFixture());
    const result = session.execute({ id: commandId("cmd_duplicate"), type: "timeline.duplicateRange", start: 3, end: 6, at: 1 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeline.cycleCount).toBe(11);
    expect(document.signals[1]).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 2, value: "A5" }, { start: 4, value: "00" }, { start: 7, value: "A5" }] });
    const clonedAnnotation = document.annotations.find((item) => item.id !== "ann_data");
    const clonedBookmark = document.bookmarks.find((item) => item.id !== "bookmark_data");
    expect(clonedAnnotation).toMatchObject({ anchor: { cycle: 2 } });
    expect(clonedBookmark).toMatchObject({ start: 2 });
    expect(clonedAnnotation && isStableId(clonedAnnotation.id)).toBe(true);
    expect(clonedBookmark && isStableId(clonedBookmark.id)).toBe(true);
    expect(clonedAnnotation?.id).not.toContain(".copy.");
    expect(clonedBookmark?.id).not.toContain(".copy.");
    expect(document.annotations).toContainEqual(expect.objectContaining({ id: "ann_data", anchor: { signalId: "sig_data", cycle: 7, point: "value-start" } }));
    expect(document.bookmarks).toContainEqual(expect.objectContaining({ id: "bookmark_data", start: 7 }));
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("matches dense state semantics for sparse duplicate and move ranges", () => {
    const originalChanges = [
      { start: 0, value: "00" },
      { start: 2, value: "A5", comment: "first" },
      { start: 5, value: "3C" },
      { start: 7, value: "00", comment: "last" },
    ];
    const dense = (changes: typeof originalChanges, count: number) => Array.from({ length: count }, (_, cycle) => {
      let state: typeof originalChanges[number] | undefined;
      for (const change of changes) { if (change.start > cycle) break; state = change; }
      return state;
    });
    const compact = (states: ReturnType<typeof dense>) => {
      const changes: Array<{ start: number; value: string; comment?: string }> = [];
      let previous: typeof states[number];
      states.forEach((state, start) => {
        if (state && (state.value !== previous?.value || state.comment !== previous?.comment)) changes.push({ start, value: state.value, ...(state.comment === undefined ? {} : { comment: state.comment }) });
        previous = state;
      });
      return changes;
    };
    const moveExpectedCycle = (cycle: number, start: number, end: number, to: number) => {
      const length = end - start;
      if (to < start) {
        if (cycle >= start && cycle < end) return to + cycle - start;
        if (cycle >= to && cycle < start) return cycle + length;
        return cycle;
      }
      if (cycle >= start && cycle < end) return to + cycle - start;
      if (cycle >= end && cycle < to + length) return cycle - length;
      return cycle;
    };
    const cases = [
      { kind: "duplicate" as const, start: 1, end: 6, at: 0 },
      { kind: "duplicate" as const, start: 2, end: 7, at: 4 },
      { kind: "duplicate" as const, start: 0, end: 3, at: 8 },
      { kind: "move" as const, start: 1, end: 4, to: 0 },
      { kind: "move" as const, start: 1, end: 4, to: 4 },
      { kind: "move" as const, start: 4, end: 7, to: 0 },
      { kind: "move" as const, start: 4, end: 7, to: 3 },
    ];

    for (const [index, operation] of cases.entries()) {
      const sourceStates = dense(originalChanges, 8);
      let expected: ReturnType<typeof dense>;
      let command;
      if (operation.kind === "duplicate") {
        expected = [...sourceStates];
        expected.splice(operation.at, 0, ...sourceStates.slice(operation.start, operation.end));
        command = { id: commandId(`cmd_sparse_duplicate_${index}`), type: "timeline.duplicateRange" as const, start: operation.start, end: operation.end, at: operation.at };
      } else {
        expected = Array<ReturnType<typeof dense>[number]>(8);
        sourceStates.forEach((state, cycle) => { expected[moveExpectedCycle(cycle, operation.start, operation.end, operation.to)] = state; });
        command = { id: commandId(`cmd_sparse_move_${index}`), type: "timeline.moveRange" as const, start: operation.start, end: operation.end, to: operation.to };
      }
      const source = canonicalFixture();
      const signal = source.signals[1]!;
      if (signal.type === "clock" || signal.type === "commentRow") throw new Error("Fixture data signal must carry values.");
      source.signals[1] = { ...signal, values: originalChanges };
      const session = new CommandHistorySession(source);
      expect(session.execute(command).ok).toBe(true);
      expect(session.historyState().undoDepth).toBe(1);
      const resultSignal = session.getSnapshot().document.signals.find((item) => item.id === "sig_data");
      expect(resultSignal?.type === "clock" || resultSignal?.type === "commentRow" ? [] : resultSignal?.values).toEqual(compact(expected));
      const transformed = session.getSnapshot().document;
      expect(session.undo().ok).toBe(true);
      expect(session.getSnapshot().document).toEqual(source);
      expect(session.redo().ok).toBe(true);
      expect(session.getSnapshot().document).toEqual(transformed);
    }
  });

  it("restarts value compression after an uninitialized sparse interval", () => {
    const source = canonicalFixture();
    const signal = source.signals[1]!;
    if (signal.type === "clock" || signal.type === "commentRow") throw new Error("Fixture data signal must carry values.");
    source.signals[1] = { ...signal, values: [{ start: 2, value: "00" }, { start: 5, value: "01" }] };
    const session = new CommandHistorySession(source);
    expect(session.execute({ id: commandId("cmd_sparse_uninitialized"), type: "timeline.duplicateRange", start: 2, end: 6, at: 0 }).ok).toBe(true);
    const resultSignal = session.getSnapshot().document.signals.find((item) => item.id === "sig_data");
    expect(resultSignal?.type === "clock" || resultSignal?.type === "commentRow" ? [] : resultSignal?.values).toEqual([
      { start: 0, value: "00" },
      { start: 3, value: "01" },
      { start: 6, value: "00" },
      { start: 9, value: "01" },
    ]);
  });

  it("keeps range transforms bounded by sparse changes on a large multi-signal timeline", () => {
    const cycleCount = 99_990;
    const source = canonicalFixture();
    source.timeline = { ...source.timeline, end: cycleCount, cycleCount };
    const template = source.signals[1] as ValueSignal;
    const extraSignals = Array.from({ length: 98 }, (_, index): ValueSignal => {
      const id = `sparse_signal_${index}` as SignalId;
      return { ...template, id, name: id, source: { ...template.source, signalName: id }, display: { ...template.display, name: id } };
    });
    const values = Array.from({ length: 256 }, (_, index) => ({ start: Math.floor(index * cycleCount / 256), value: index % 2 === 0 ? "00" : "01" }));
    source.signals = [source.signals[0]!, { ...template, values }, ...extraSignals.map((signal) => ({ ...signal, values }))];
    const group = source.signalGroups[0]!;
    source.signalGroups = [{ ...group, rows: source.signals.map((signal) => signal.id) }];

    const duplicateSession = new CommandHistorySession(source);
    const duplicateStartedAt = performance.now();
    const duplicate = duplicateSession.execute({ id: commandId("cmd_sparse_large_duplicate"), type: "timeline.duplicateRange", start: 10_000, end: 10_010, at: 30_000 });
    const duplicateDurationMs = performance.now() - duplicateStartedAt;
    expect(duplicate.ok).toBe(true);
    expect(duplicateSession.getSnapshot().document.timeline.cycleCount).toBe(100_000);
    expect(duplicateDurationMs).toBeLessThan(2_000);

    const moveSession = new CommandHistorySession(source);
    const moveStartedAt = performance.now();
    const move = moveSession.execute({ id: commandId("cmd_sparse_large_move"), type: "timeline.moveRange", start: 10_000, end: 20_000, to: 30_000 });
    const moveDurationMs = performance.now() - moveStartedAt;
    expect(move.ok).toBe(true);
    expect(moveSession.getSnapshot().document.timeline.cycleCount).toBe(cycleCount);
    expect(moveDurationMs).toBeLessThan(2_000);
  }, 10_000);

  it("clones a boundary-owned Time Group resume anchor with its group", () => {
    const source = canonicalFixture();
    const groupId = "time_owned" as TimeGroupId;
    const anchorId = "label_owned" as LabelAnchorId;
    source.timeGroups = [{ id: groupId, name: "Fold", start: 3, end: 8, presentation: { collapsed: true, foldStyle: "axis-break", resumeLabelAnchorId: anchorId } }];
    source.timeline = { ...source.timeline, end: 10, cycleCount: 10, labelAnchors: [{ id: anchorId, source: 8, display: 8, ownerTimeGroupId: groupId }] };
    const session = new CommandHistorySession(source);
    expect(session.execute({ id: commandId("cmd_owned_duplicate"), type: "timeline.duplicateRange", start: 3, end: 8, at: 0 }).ok).toBe(true);
    const document = session.getSnapshot().document;
    const clonedGroup = document.timeGroups.find((group) => group.id !== groupId)!;
    const clonedAnchor = document.timeline.labelAnchors.find((anchor) => anchor.id !== anchorId);
    expect(clonedGroup?.presentation?.resumeLabelAnchorId).toBe(clonedAnchor?.id);
    expect(clonedAnchor).toMatchObject({ source: 5, ownerTimeGroupId: clonedGroup?.id });
  });

  it("allocates collision-free opaque clone IDs after reload when a command ID is reused", () => {
    const first = new CommandHistorySession(rippleFixture());
    expect(first.execute({ id: commandId("cmd_duplicate"), type: "timeline.duplicateRange", start: 3, end: 6, at: 1 }).ok).toBe(true);
    const existingClone = first.getSnapshot().document.annotations.find((item) => item.id !== "ann_data")!;
    const reloaded = rippleFixture();
    reloaded.annotations = [...reloaded.annotations, existingClone];
    const session = new CommandHistorySession(reloaded);
    const result = session.execute({ id: commandId("cmd_duplicate"), type: "timeline.duplicateRange", start: 3, end: 6, at: 1 });
    expect(result.ok).toBe(true);
    const cloneIds = session.getSnapshot().document.annotations.filter((item) => item.id !== "ann_data").map((item) => item.id);
    expect(cloneIds).toContain(existingClone.id);
    expect(new Set(cloneIds).size).toBe(2);
    expect(cloneIds.every((id) => isStableId(id) && !id.includes(".copy."))).toBe(true);
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
