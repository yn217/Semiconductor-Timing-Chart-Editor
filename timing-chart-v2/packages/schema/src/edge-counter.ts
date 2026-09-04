import type { Bookmark, CanonicalDocument, EdgeCounterSettings } from "./types.js";

/** Resolves the explicit Bookmark selected by an Edge Counter. */
export function resolveEdgeCounterMarker(document: CanonicalDocument, settings: EdgeCounterSettings): Bookmark | undefined {
  if (settings.countFrom !== "marker" || settings.anchorId === undefined) return undefined;
  return document.bookmarks.find((bookmark) => bookmark.id === settings.anchorId);
}
