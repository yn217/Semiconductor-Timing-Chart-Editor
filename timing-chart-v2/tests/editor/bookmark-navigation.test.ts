import { describe, expect, it } from "vitest";
import type { Bookmark, BookmarkId } from "@timing-chart-v2/schema";
import { findAdjacentBookmark } from "../../apps/editor/src/runtime/bookmark-navigation.js";

const bookmark = (id: string, start: number): Bookmark => ({ id: id as BookmarkId, name: id, start });

describe("findAdjacentBookmark", () => {
  it("visits every bookmark sharing a cycle when stepping from the active bookmark", () => {
    const bookmarks = [bookmark("A", 5), bookmark("B", 5), bookmark("C", 9)];
    const pointAt = (b: Bookmark) => ({ start: b.start, end: b.start + 1 });
    const nextOf = (b: Bookmark) => findAdjacentBookmark(bookmarks, pointAt(b), 1, b.id)?.id;
    const previousOf = (b: Bookmark) => findAdjacentBookmark(bookmarks, pointAt(b), -1, b.id)?.id;

    expect(nextOf(bookmarks[0]!)).toBe("B");
    expect(nextOf(bookmarks[1]!)).toBe("C");
    expect(nextOf(bookmarks[2]!)).toBe("A");
    expect(previousOf(bookmarks[0]!)).toBe("C");
    expect(previousOf(bookmarks[1]!)).toBe("A");
    expect(previousOf(bookmarks[2]!)).toBe("B");
  });

  it("reaches both same-cycle bookmarks in a full Next cycle", () => {
    const bookmarks = [bookmark("A", 5), bookmark("B", 5), bookmark("C", 9)];
    const visited: string[] = [];
    let current = bookmarks[0]!;
    for (let step = 0; step < bookmarks.length; step += 1) {
      current = findAdjacentBookmark(bookmarks, { start: current.start, end: current.start + 1 }, 1, current.id)!;
      visited.push(current.id);
    }
    expect(visited.sort()).toEqual(["A", "B", "C"]);
  });

  it("keeps range-based navigation unchanged when no bookmark is active", () => {
    const bookmarks = [bookmark("late", 20), bookmark("early", 3), bookmark("mid", 10)];
    expect(findAdjacentBookmark(bookmarks, { start: 0, end: 1 }, 1)?.id).toBe("early");
    expect(findAdjacentBookmark(bookmarks, { start: 3, end: 4 }, 1)?.id).toBe("mid");
    expect(findAdjacentBookmark(bookmarks, { start: 10, end: 12 }, -1)?.id).toBe("early");
    expect(findAdjacentBookmark(bookmarks, { start: 0, end: 1 }, -1)?.id).toBe("late");
    expect(findAdjacentBookmark(bookmarks, { start: 25, end: 26 }, 1)?.id).toBe("early");
  });

  it("returns undefined for an empty bookmark list and wraps a lone bookmark to itself", () => {
    expect(findAdjacentBookmark([], { start: 0, end: 1 }, 1)).toBeUndefined();
    const only = bookmark("solo", 7);
    expect(findAdjacentBookmark([only], { start: 7, end: 8 }, 1, only.id)?.id).toBe("solo");
    expect(findAdjacentBookmark([only], { start: 7, end: 8 }, -1, only.id)?.id).toBe("solo");
  });
});
