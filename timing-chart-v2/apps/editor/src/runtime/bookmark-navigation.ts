import type { Bookmark } from "@timing-chart-v2/schema";

/** #388/#422: the single Bookmark previous/next resolution owner -- shared
 * verbatim by the Timeline Ribbon's Previous/Next buttons
 * (timeline-toolbar.tsx) and the Bottom Bookmarks panel's Previous/Next
 * buttons (bookmark-editor.tsx), so the two surfaces can never disagree on
 * "what counts as the next Bookmark". Pure/view-only: callers still own
 * dispatching the actual navigation (`onNavigateBookmark`), so this touches
 * no Canonical/History/Dirty state itself.
 *
 * Order is Cycle-ascending; a same-cycle tie breaks by document order
 * (`Array.prototype.sort` is stable), giving a deterministic order without
 * inventing a synthetic sort key. `referenceRange` is the caller's current
 * position: the Timeline's selected range when nothing is individually
 * selected, or `{ start: selected.start, end: selected.start + 1 }` when a
 * specific Bookmark is the current selection (Bottom panel) -- Previous
 * resolves to the nearest Bookmark strictly before `referenceRange.start`,
 * Next to the nearest at or after `referenceRange.end`, wrapping to the
 * last/first Bookmark respectively when already at an end.
 *
 * Bookmarks that share a Cycle are not distinguishable by range alone, so when
 * the caller knows the Bookmark it is currently on (`activeBookmarkId`), the
 * step is taken from that Bookmark's position in the ordered list instead.
 * Every Bookmark is then reachable by repeated Next/Previous, including ties. */
export function findAdjacentBookmark(bookmarks: readonly Bookmark[], referenceRange: { readonly start: number; readonly end: number }, direction: -1 | 1, activeBookmarkId?: Bookmark["id"]): Bookmark | undefined {
  const ordered = [...bookmarks].sort((left, right) => left.start - right.start);
  if (ordered.length === 0) return undefined;
  const activeIndex = activeBookmarkId === undefined ? -1 : ordered.findIndex((bookmark) => bookmark.id === activeBookmarkId);
  if (activeIndex >= 0) return ordered[(activeIndex + direction + ordered.length) % ordered.length];
  return direction < 0
    ? [...ordered].reverse().find((bookmark) => bookmark.start < referenceRange.start) ?? ordered.at(-1)
    : ordered.find((bookmark) => bookmark.start >= referenceRange.end) ?? ordered[0];
}
