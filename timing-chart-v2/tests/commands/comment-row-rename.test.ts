import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CommandId, CommentRow, GroupId, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Comment Row rename", () => {
  it("a generic Rename updates the Comment Row title with its name, and Undo restores both", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const commentRow: CommentRow = { id: "comment_review" as SignalId, type: "commentRow", name: "Review", role: "internal", source: { instancePath: [], signalName: "review" }, display: { name: "Review" }, title: "Review", body: "Body" };
    expect(session.execute({ id: "cmd_c_create" as CommandId, type: "commentRow.create", commentRow, targetGroupId: "grp_main" as GroupId, index: 2 }).ok).toBe(true);
    expect(session.execute({ id: "cmd_c_rename" as CommandId, type: "signal.rename", signalId: commentRow.id, name: "Notes" }).ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === commentRow.id)).toMatchObject({ name: "Notes", title: "Notes", display: { name: "Notes" }, body: "Body" });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === commentRow.id)).toMatchObject({ name: "Review", title: "Review" });
  });
});
