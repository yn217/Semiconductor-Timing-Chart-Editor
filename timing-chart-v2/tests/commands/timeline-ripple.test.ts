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
    timeGroups: [{ id: "time_wait" as TimeGroupId, name: "Wait", start: 2, end: 5 }],
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
});
