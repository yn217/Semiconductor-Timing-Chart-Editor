import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CommandId, LabelAnchorId, TimeGroupId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;

// #376: standalone Label Anchors -- a ruler-number restart independent of
// any Time Group/Axis Break fold. labelAnchor.create/update/delete always
// produce/operate on a standalone anchor (no ownerTimeGroupId); a Time
// Group's own fold-resume anchor stays owned by the Time Group's own
// lifecycle (#202), so the two paths can never leave the other dangling.
describe("labelAnchor commands", () => {
  it("creates a standalone Label Anchor with one History entry and a geometry-only ChangeSet", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const result = session.execute({ id: commandId("cmd_create"), type: "labelAnchor.create", labelAnchor: { id: "label_100" as LabelAnchorId, source: 5, display: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet).toEqual({ timelineSemantics: true, geometryScreenX: true, minimapOverview: true });
    expect(result.snapshot.document.timeline.labelAnchors).toEqual([{ id: "label_100", source: 5, display: 0 }]);
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("rejects labelAnchor.create with a duplicate ID, an owner, an out-of-range source, or a conflicting source", () => {
    const document = { ...canonicalFixture(), timeline: { ...canonicalFixture().timeline, labelAnchors: [{ id: "label_existing" as LabelAnchorId, source: 5, display: 0 }] } };
    const session = new CommandHistorySession(document);
    const duplicateId = session.execute({ id: commandId("cmd_dup_id"), type: "labelAnchor.create", labelAnchor: { id: "label_existing" as LabelAnchorId, source: 8, display: 3 } });
    expect(duplicateId.ok).toBe(false);
    if (!duplicateId.ok) expect(duplicateId.problems[0]?.code).toBe("DUPLICATE_ID");

    const ownedRejected = session.execute({ id: commandId("cmd_owner"), type: "labelAnchor.create", labelAnchor: { id: "label_owned" as LabelAnchorId, source: 8, display: 3, ownerTimeGroupId: "time_x" as TimeGroupId } });
    expect(ownedRejected.ok).toBe(false);
    if (!ownedRejected.ok) expect(ownedRejected.problems[0]?.code).toBe("LABEL_ANCHOR_OWNER_NOT_ALLOWED");

    const outOfRange = session.execute({ id: commandId("cmd_range"), type: "labelAnchor.create", labelAnchor: { id: "label_far" as LabelAnchorId, source: 999999, display: 0 } });
    expect(outOfRange.ok).toBe(false);
    if (!outOfRange.ok) expect(outOfRange.problems[0]?.code).toBe("TIMELINE_OUT_OF_RANGE");

    const sourceConflict = session.execute({ id: commandId("cmd_conflict"), type: "labelAnchor.create", labelAnchor: { id: "label_conflict" as LabelAnchorId, source: 5, display: 99 } });
    expect(sourceConflict.ok).toBe(false);
    if (!sourceConflict.ok) expect(sourceConflict.problems[0]?.code).toBe("LABEL_ANCHOR_SOURCE_CONFLICT");

    expect(session.historyState().undoDepth).toBe(0);
  });

  it("updates a standalone Label Anchor, rejects a no-op and a source conflict with another anchor, and preserves the original through Undo", () => {
    const document = { ...canonicalFixture(), timeline: { ...canonicalFixture().timeline, labelAnchors: [{ id: "label_a" as LabelAnchorId, source: 2, display: 0 }, { id: "label_b" as LabelAnchorId, source: 5, display: 50 }] } };
    const session = new CommandHistorySession(document);

    const noOp = session.execute({ id: commandId("cmd_noop"), type: "labelAnchor.update", labelAnchorId: "label_a" as LabelAnchorId, source: 2, display: 0 });
    expect(noOp.ok).toBe(false);
    if (!noOp.ok) expect(noOp.reason).toBe("no-op");

    const conflict = session.execute({ id: commandId("cmd_conflict"), type: "labelAnchor.update", labelAnchorId: "label_a" as LabelAnchorId, source: 5, display: 0 });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.problems[0]?.code).toBe("LABEL_ANCHOR_SOURCE_CONFLICT");

    const updated = session.execute({ id: commandId("cmd_update"), type: "labelAnchor.update", labelAnchorId: "label_a" as LabelAnchorId, source: 3, display: 1000 });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.snapshot.document.timeline.labelAnchors.find((item) => item.id === "label_a")).toEqual({ id: "label_a", source: 3, display: 1000 });
    expect(session.historyState().undoDepth).toBe(1);

    const undone = session.undo();
    expect(undone.ok).toBe(true);
    if (undone.ok) expect(undone.snapshot.document.timeline.labelAnchors.find((item) => item.id === "label_a")).toEqual({ id: "label_a", source: 2, display: 0 });
  });

  it("rejects update/delete on a Time Group-owned Label Anchor, directing it to the Time Group instead", () => {
    const document = {
      ...canonicalFixture(),
      timeline: { ...canonicalFixture().timeline, labelAnchors: [{ id: "label_owned" as LabelAnchorId, source: 5, display: 0, ownerTimeGroupId: "time_x" as TimeGroupId }] },
      timeGroups: [{ id: "time_x" as TimeGroupId, name: "Wait", start: 2, end: 5, presentation: { resumeLabelAnchorId: "label_owned" as LabelAnchorId } }],
    };
    const session = new CommandHistorySession(document);
    const updateOwned = session.execute({ id: commandId("cmd_update_owned"), type: "labelAnchor.update", labelAnchorId: "label_owned" as LabelAnchorId, source: 6, display: 1 });
    expect(updateOwned.ok).toBe(false);
    if (!updateOwned.ok) expect(updateOwned.problems[0]?.code).toBe("LABEL_ANCHOR_OWNED_BY_TIME_GROUP");
    const deleteOwned = session.execute({ id: commandId("cmd_delete_owned"), type: "labelAnchor.delete", labelAnchorId: "label_owned" as LabelAnchorId });
    expect(deleteOwned.ok).toBe(false);
    if (!deleteOwned.ok) expect(deleteOwned.problems[0]?.code).toBe("LABEL_ANCHOR_OWNED_BY_TIME_GROUP");
    expect(session.historyState().undoDepth).toBe(0);
  });

  it("deletes a standalone Label Anchor with exact Undo/Redo", () => {
    const document = { ...canonicalFixture(), timeline: { ...canonicalFixture().timeline, labelAnchors: [{ id: "label_a" as LabelAnchorId, source: 5, display: 0 }] } };
    const session = new CommandHistorySession(document);
    const deleted = session.execute({ id: commandId("cmd_delete"), type: "labelAnchor.delete", labelAnchorId: "label_a" as LabelAnchorId });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.snapshot.document.timeline.labelAnchors).toEqual([]);
    const undone = session.undo();
    if (undone.ok) expect(undone.snapshot.document.timeline.labelAnchors).toEqual([{ id: "label_a", source: 5, display: 0 }]);
    const redone = session.redo();
    if (redone.ok) expect(redone.snapshot.document.timeline.labelAnchors).toEqual([]);
  });
});
