import { expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { resolveTimeGroupRange } from "@timing-chart-v2/commands";
import { parseDocument, serializeCanonicalDocument, validateCanonicalDocument, type CommandId, type TimeGroupId } from "@timing-chart-v2/schema";
import { canonicalFixtureWithStableValueIds } from "../fixtures/canonical.js";

const create = (session: CommandHistorySession, id: string, start: number, end: number) => session.execute({ id: `cmd_${id}` as CommandId, type: "timeGroup.groupRange", timeGroupId: id as TimeGroupId, start, end, name: id });
const groups = (session: CommandHistorySession) => session.getSnapshot().document.timeGroups;
const ungroup = (session: CommandHistorySession, id: string) => session.execute({ id: `remove_${id}` as CommandId, type: "timeGroup.ungroup", timeGroupId: id as TimeGroupId });

it("groups siblings atomically, resolves the innermost parent and roundtrips history/persistence", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(create(session, "a", 1, 3).ok).toBe(true);
  expect(create(session, "b", 3, 5).ok).toBe(true);
  const before = session.getSnapshot().document;
  const metrics = session.metrics();
  expect(create(session, "outer", 0, 8).ok).toBe(true);
  expect(session.historyState().undoDepth).toBe(3);
  expect(groups(session).slice(0, 2).map(g => g.parentId)).toEqual(["outer", "outer"]);
  const after = session.getSnapshot().document;
  expect(session.metrics().validationRuns - metrics.validationRuns).toBe(1);
  expect(session.undo().ok).toBe(true);
  expect(session.getSnapshot().document).toEqual(before);
  expect(session.redo().ok).toBe(true);
  expect(session.getSnapshot().document).toEqual(after);
  expect(create(session, "leaf", 1, 2).ok).toBe(true);
  expect(groups(session).find(g => g.id === "leaf")?.parentId).toBe("a");
  const restored = parseDocument(serializeCanonicalDocument(session.getSnapshot().document));
  expect(restored.ok).toBe(true);
  if (restored.ok) expect(restored.document).toEqual(session.getSnapshot().document);
});

it("promotes root and nested children with exact Undo/Redo and leaves unrelated groups intact", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  for (const [id, start, end] of [["root", 0, 7], ["mid", 1, 6], ["leaf", 2, 5], ["other", 7, 8]] as const) expect(create(session, id, start, end).ok).toBe(true);
  const before = session.getSnapshot().document;
  expect(ungroup(session, "mid").ok).toBe(true);
  expect(groups(session).find(g => g.id === "leaf")?.parentId).toBe("root");
  const after = session.getSnapshot().document;
  session.undo();
  expect(session.getSnapshot().document).toEqual(before);
  session.redo();
  expect(session.getSnapshot().document).toEqual(after);
  expect(ungroup(session, "root").ok).toBe(true);
  expect(groups(session).every(g => g.parentId === undefined)).toBe(true);
});

it.each([[2, 6, "TIME_GROUP_PARTIAL_OVERLAP"], [1, 4, "TIME_GROUP_EQUAL_RANGE"], [3, 3, "TIME_GROUP_SELECTION_EMPTY"], [-1, 2, "TIMELINE_OUT_OF_RANGE"], [0, 9, "TIMELINE_OUT_OF_RANGE"]] as const)("rejects [%s,%s) with %s atomically", (start, end, code) => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  create(session, "a", 1, 4);
  session.markClean();
  const before = session.getSnapshot();
  const history = session.historyState();
  const result = create(session, "bad", start, end);
  expect(result).toMatchObject({ ok: false, problems: [expect.objectContaining({ code })] });
  expect(session.getSnapshot()).toBe(before);
  expect(session.historyState()).toEqual(history);
});

it("exposes no-selection capability and missing-target diagnostics", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  expect(resolveTimeGroupRange(session.getSnapshot().document)).toMatchObject({ ok: false, code: "TIME_GROUP_SELECTION_EMPTY" });
  expect(ungroup(session, "missing")).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "TIME_GROUP_NOT_FOUND" })] });
});

it("preserves parent links during property edits and rejects invalid containment atomically", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  create(session, "parent", 1, 7);
  create(session, "child", 2, 5);
  expect(session.execute({ id: "rename" as CommandId, type: "timeGroup.update", timeGroupId: "child" as TimeGroupId, name: "renamed", start: 2, end: 5 }).ok).toBe(true);
  expect(groups(session)[1]?.parentId).toBe("parent");
  const before = session.getSnapshot();
  expect(session.execute({ id: "bad" as CommandId, type: "timeGroup.update", timeGroupId: "child" as TimeGroupId, name: "outside", start: 0, end: 6 }).ok).toBe(false);
  expect(session.getSnapshot()).toBe(before);
});

it("maintains nested hierarchy during insert/delete and exact Undo", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  create(session, "root", 0, 8);
  create(session, "child", 1, 7);
  create(session, "leaf", 2, 5);
  const before = session.getSnapshot().document;
  expect(session.execute({ id: "insert" as CommandId, type: "timeline.insert", at: 3, count: 2 }).ok).toBe(true);
  expect(validateCanonicalDocument(session.getSnapshot().document)).toEqual([]);
  expect(session.execute({ id: "delete" as CommandId, type: "timeline.delete", start: 1, end: 6 }).ok).toBe(true);
  expect(validateCanonicalDocument(session.getSnapshot().document)).toEqual([]);
  session.undo(); session.undo();
  expect(session.getSnapshot().document).toEqual(before);
});

it("duplicates a subtree with fresh reciprocal parent IDs", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  create(session, "root", 0, 4);
  create(session, "child", 1, 3);
  const before = session.getSnapshot().document;
  expect(session.execute({ id: "duplicate" as CommandId, type: "timeline.duplicateRange", start: 0, end: 4, at: 8 }).ok).toBe(true);
  const copied = groups(session).filter(g => g.id !== "root" && g.id !== "child");
  expect(copied).toHaveLength(2);
  expect(copied.find(g => g.name === "child")?.parentId).toBe(copied.find(g => g.name === "root")?.id);
  expect(validateCanonicalDocument(session.getSnapshot().document)).toEqual([]);
  session.undo();
  expect(session.getSnapshot().document).toEqual(before);
});

it("resolves parents independently of array order and rejects partial-overlap range edits", () => {
  const session = new CommandHistorySession(canonicalFixtureWithStableValueIds());
  create(session, "root", 0, 8);
  create(session, "left", 1, 4);
  create(session, "right", 5, 7);
  const doc = session.getSnapshot().document;
  expect(resolveTimeGroupRange(doc, { start: 1, end: 2 })).toEqual(resolveTimeGroupRange({ ...doc, timeGroups: [...doc.timeGroups].reverse() }, { start: 1, end: 2 }));
  expect(session.execute({ id: "overlap" as CommandId, type: "timeGroup.update", timeGroupId: "right" as TimeGroupId, name: "right", start: 3, end: 7 })).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "TIME_GROUP_PARTIAL_OVERLAP" })] });
  expect(session.getSnapshot().document).toBe(doc);
});
