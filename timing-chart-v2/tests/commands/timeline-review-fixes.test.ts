import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { Annotation, AnnotationId, BookmarkId, CommandId, LabelAnchorId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;

function collapsedGroupFixture() {
  const document = canonicalFixture();
  return {
    ...document,
    timeline: {
      ...document.timeline,
      labelAnchors: [{ id: "label_wait" as LabelAnchorId, source: 5, display: 20, ownerTimeGroupId: "time_wait" as TimeGroupId }],
    },
    bookmarks: [{ id: "bookmark_data" as BookmarkId, name: "Data", start: 4 }],
    timeGroups: [{ id: "time_wait" as TimeGroupId, name: "Wait", start: 2, end: 5, presentation: { resumeLabelAnchorId: "label_wait" as LabelAnchorId } }],
    annotations: [],
    transactions: [{ id: "txn_data" as TransactionId, name: "Transfer", start: 4, end: 7 }],
  };
}

describe("timeline review fixes", () => {
  it("inserts at a collapsed Time Group end and keeps the resume anchor at the group end", () => {
    const initial = collapsedGroupFixture();
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_insert_at_group_end"), type: "timeline.insert", at: 5, count: 2 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeGroups[0]).toMatchObject({ start: 2, end: 5 });
    expect(document.timeline.labelAnchors[0]).toMatchObject({ id: "label_wait", source: 5, display: 20 });
    expect(document.timeline.cycleCount).toBe(initial.timeline.cycleCount + 2);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
  });

  it("still shifts a resume anchor when inserting strictly inside the group", () => {
    const session = new CommandHistorySession(collapsedGroupFixture());
    const result = session.execute({ id: commandId("cmd_insert_inside_group"), type: "timeline.insert", at: 3, count: 2 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeGroups[0]).toMatchObject({ start: 2, end: 7 });
    expect(document.timeline.labelAnchors[0]?.source).toBe(7);
  });

  it("duplicates a range ending at a labelled Time Group end without a label source collision", () => {
    const initial = collapsedGroupFixture();
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_duplicate_after_group"), type: "timeline.duplicateRange", start: 2, end: 5, at: 5 });
    expect(result.ok).toBe(true);
    const document = session.getSnapshot().document;
    expect(document.timeGroups).toHaveLength(2);
    const clone = document.timeGroups.find((group) => group.id !== "time_wait");
    expect(clone).toMatchObject({ start: 5, end: 8 });
    const sources = document.timeline.labelAnchors.map((anchor) => anchor.source).sort((a, b) => a - b);
    expect(sources).toEqual([5, 8]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
  });

  it("removes a span annotation whose mapped endpoints collapse under a partial delete", () => {
    const initial = canonicalFixture();
    const collapsing: Annotation = { id: "ann_collapse" as AnnotationId, type: "range", label: "Collapse", visible: true, start: { cycle: 4, point: "cycle-start" }, end: { cycle: 7, point: "cycle-end" } };
    const surviving: Annotation = { id: "ann_survive" as AnnotationId, type: "range", label: "Survive", visible: true, start: { cycle: 1, point: "cycle-start" }, end: { cycle: 4, point: "cycle-end" } };
    initial.annotations = [collapsing, surviving];
    const session = new CommandHistorySession(initial);
    const result = session.execute({ id: commandId("cmd_delete_collapsing_span"), type: "timeline.delete", start: 2, end: 7 });
    expect(result.ok).toBe(true);
    const annotations = session.getSnapshot().document.annotations;
    expect(annotations.map((annotation) => annotation.id)).toEqual(["ann_survive"]);
    expect(annotations[0]).toMatchObject({ start: { cycle: 1 }, end: { cycle: 2 } });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
  });
});
