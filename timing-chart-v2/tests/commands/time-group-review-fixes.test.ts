import { expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { validateCanonicalDocument, type CommandId, type TimeGroupId } from "@timing-chart-v2/schema";
import { canonicalFixtureWithStableValueIds } from "../fixtures/canonical.js";

const createGroup = (session: CommandHistorySession, id: string, start: number, end: number) => session.execute({
  id: `cmd_create_${id}` as CommandId,
  type: "timeGroup.create",
  timeGroup: { id: id as TimeGroupId, name: id, start, end, presentation: { collapsed: false, foldStyle: "none" } },
});
/** Nested setup through the hierarchy-aware groupRange path (the Ctrl+G/GUI path), so the parent link is established independently of create. */
const groupRangeNested = (session: CommandHistorySession, id: string, start: number, end: number) => session.execute({ id: `cmd_group_${id}` as CommandId, type: "timeGroup.groupRange", timeGroupId: id as TimeGroupId, start, end, name: id });
const renameGroup =(session: CommandHistorySession, id: string, start: number, end: number) => {
  const group = session.getSnapshot().document.timeGroups.find((item) => item.id === id)!;
  return session.execute({ id: `cmd_rename_${id}` as CommandId, type: "timeGroup.update", timeGroupId: id as TimeGroupId, name: `${id}_renamed`, start, end, presentation: group.presentation });
};
const groupsById = (session: CommandHistorySession) => new Map(session.getSnapshot().document.timeGroups.map((group) => [group.id, group]));

it("rejects a Timeline-ribbon Time Group that partially overlaps an existing group, atomically", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(createGroup(session, "a", 1, 4).ok).toBe(true);
  const before = session.getSnapshot();
  const history = session.historyState();
  expect(createGroup(session, "b", 3, 6)).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "TIME_GROUP_PARTIAL_OVERLAP" })] });
  expect(session.getSnapshot()).toBe(before);
  expect(session.historyState()).toEqual(history);
});

it("rejects a Time Group whose range equals an existing group", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(createGroup(session, "a", 1, 4).ok).toBe(true);
  expect(createGroup(session, "b", 1, 4)).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "TIME_GROUP_EQUAL_RANGE" })] });
});

it("creates a Time Group nested inside an existing group with the innermost parent and stays editable", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(createGroup(session, "outer", 0, 8).ok).toBe(true);
  expect(createGroup(session, "inner", 2, 4).ok).toBe(true);
  expect(groupsById(session).get("inner" as TimeGroupId)?.parentId).toBe("outer");
  expect(renameGroup(session, "inner", 2, 4).ok).toBe(true);
  expect(validateCanonicalDocument(session.getSnapshot().document)).toEqual([]);
});

it("creating an enclosing Time Group adopts the enclosed roots and keeps the hierarchy valid", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(createGroup(session, "inner", 2, 4).ok).toBe(true);
  expect(createGroup(session, "outer", 0, 8).ok).toBe(true);
  expect(groupsById(session).get("inner" as TimeGroupId)?.parentId).toBe("outer");
  expect(groupsById(session).get("outer" as TimeGroupId)?.parentId).toBeUndefined();
  expect(validateCanonicalDocument(session.getSnapshot().document)).toEqual([]);
});

it("duplicateRange of a child whose parent lies outside the range clones it as a root instead of failing", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(groupRangeNested(session, "outer", 0, 8).ok).toBe(true);
  expect(groupRangeNested(session, "child", 2, 4).ok).toBe(true);
  expect(groupsById(session).get("child" as TimeGroupId)?.parentId).toBe("outer");
  const result = session.execute({ id: "dup_child" as CommandId, type: "timeline.duplicateRange", start: 2, end: 4, at: 8 });
  expect(result.ok).toBe(true);
  const clone = [...groupsById(session).values()].find((group) => group.name === "child" && group.id !== "child");
  expect(clone).toMatchObject({ start: 8, end: 10 });
  expect(clone?.parentId).toBeUndefined();
  expect(validateCanonicalDocument(session.getSnapshot().document)).toEqual([]);
});

it("timeline delete that collapses a child onto its parent's range removes the child and keeps the parent editable", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(groupRangeNested(session, "parent", 0, 6).ok).toBe(true);
  expect(groupRangeNested(session, "child", 2, 6).ok).toBe(true);
  expect(groupsById(session).get("child" as TimeGroupId)?.parentId).toBe("parent");
  expect(session.execute({ id: "del" as CommandId, type: "timeline.delete", start: 0, end: 2 }).ok).toBe(true);
  const groups = groupsById(session);
  expect(groups.has("child" as TimeGroupId)).toBe(false);
  expect(groups.get("parent" as TimeGroupId)).toMatchObject({ start: 0, end: 4 });
  expect(validateCanonicalDocument(session.getSnapshot().document)).toEqual([]);
  expect(renameGroup(session, "parent", 0, 4).ok).toBe(true);
});
