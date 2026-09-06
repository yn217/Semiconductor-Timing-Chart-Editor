import { expect, it } from "vitest";
import { buildTimeGroupHierarchy, parseDocument, serializeCanonicalDocument, validateCanonicalDocument, type TimeGroup, type TimeGroupId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const group = (id: string, start: number, end: number, parentId?: string): TimeGroup => ({ id: id as TimeGroupId, name: id, start, end, ...(parentId === undefined ? {} : { parentId: parentId as TimeGroupId }) });
const document = (timeGroups: readonly TimeGroup[]) => ({ ...canonicalFixture(), timeGroups });

it("keeps old flat documents as roots and preserves nested Save/Open exactly", () => {
  const flat = document([group("a", 0, 8), group("b", 1, 3)]);
  const old = parseDocument(serializeCanonicalDocument(flat));
  expect(old.ok).toBe(true);
  expect(buildTimeGroupHierarchy(flat.timeGroups).roots).toHaveLength(2);
  const nested = document([group("a", 0, 7), group("b", 1, 7, "a"), group("c", 2, 6, "b"), group("d", 3, 5, "c"), group("e", 7, 8)]);
  const restored = parseDocument(serializeCanonicalDocument(nested));
  expect(restored.ok).toBe(true);
  if (restored.ok) expect(restored.document).toEqual(nested);
  const hierarchy = buildTimeGroupHierarchy(nested.timeGroups);
  expect(hierarchy.maxDepth).toBe(3);
  expect(hierarchy.depthById.get("d" as TimeGroupId)).toBe(3);
  expect(hierarchy.roots.map(g => g.id)).toEqual(["a", "e"]);
  expect(buildTimeGroupHierarchy([...nested.timeGroups].reverse())).toEqual(hierarchy);
});

it.each([
  [[group("a", 0, 8, "missing")], "TIME_GROUP_PARENT_NOT_FOUND"],
  [[group("a", 0, 8, "a")], "TIME_GROUP_PARENT_CYCLE"],
  [[group("a", 0, 8, "b"), group("b", 0, 8, "c"), group("c", 0, 8, "a")], "TIME_GROUP_PARENT_CYCLE"],
  [[group("a", 0, 4), group("b", 3, 8, "a")], "TIME_GROUP_PARENT_CONTAINMENT"],
  [[group("a", 0, 4), group("a", 0, 4)], "DUPLICATE_ID"],
] as const)("rejects malformed hierarchy %j with %s", (groups, code) => {
  const problems = validateCanonicalDocument(document(groups));
  expect(problems).toContainEqual(expect.objectContaining({ code, entityId: expect.any(String), path: expect.stringContaining("timeGroups[") }));
  expect(parseDocument(document(groups)).ok).toBe(false);
  expect(() => buildTimeGroupHierarchy(groups)).toThrow();
});

it("allows shared parent boundaries and equal-range explicit chains without recursion limits", () => {
  const groups = Array.from({ length: 10000 }, (_, i) => group(`g${i}`, 0, 8, i ? `g${i - 1}` : undefined));
  expect(validateCanonicalDocument(document(groups))).toEqual([]);
  const hierarchy = buildTimeGroupHierarchy([...groups].reverse());
  expect(hierarchy.maxDepth).toBe(9999);
});
