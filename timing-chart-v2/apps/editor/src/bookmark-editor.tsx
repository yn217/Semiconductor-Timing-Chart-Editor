import { useEffect, useState } from "react";
import type { HistoryState } from "@timing-chart-v2/history";
import type { Bookmark, BookmarkId, CanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { nextEntityId } from "./entity-id.js";
import { findAdjacentBookmark } from "./runtime/bookmark-navigation.js";
import { DraftStatus } from "./draft-status.js";

/** #388: Bookmark's own Bottom Panel editor -- moves persistent Bookmark
 * data management out of the Ribbon (which must stay a fixed command
 * surface, see timeline-toolbar.tsx) into the same Bottom Editor pattern
 * TransactionEditor already uses. Reuses the canonical `bookmark.create/
 * update/delete` SemanticCommands as its only mutation path -- no second
 * Bookmark list/store. */
export function BookmarkEditor({ bookmark, document, history, range, onSelect, onReveal, onNavigateBookmark, commands, onUndo, onRedo, onDelete, onCancel }: { readonly bookmark: Bookmark | undefined; readonly document: CanonicalDocument; readonly history: HistoryState; readonly range: { readonly start: number; readonly end: number }; readonly onSelect: (id: BookmarkId) => void; readonly onReveal: (start: number) => void; readonly onNavigateBookmark: (cycle: number, bookmarkId?: BookmarkId) => void; readonly commands: Pick<EditorSurfaceCommandController, "createBookmark" | "updateBookmark" | "updateTimeGroupPresentation">; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState("Bookmark");
  const [start, setStart] = useState(0);
  const [comment, setComment] = useState("");
  const [editName, setEditName] = useState(bookmark?.name ?? "");
  const [editStart, setEditStart] = useState(bookmark?.start ?? 0);
  const [editComment, setEditComment] = useState(bookmark?.comment ?? "");
  useEffect(() => {
    setEditName(bookmark?.name ?? "");
    setEditStart(bookmark?.start ?? 0);
    setEditComment(bookmark?.comment ?? "");
  }, [bookmark?.id, bookmark?.name, bookmark?.start, bookmark?.comment]);
  const ordered = [...document.bookmarks].sort((left, right) => left.start - right.start);
  const duplicate = () => {
    if (!bookmark) return;
    const id = nextEntityId("bookmark", document) as BookmarkId;
    const result = commands.createBookmark({ id, name: `${bookmark.name} Copy`, start: bookmark.start, ...(bookmark.comment === undefined ? {} : { comment: bookmark.comment }) });
    if (result.ok) onSelect(id);
  };
  // #422: Previous/Next reuse the exact same resolver the Timeline Ribbon's
  // own Previous/Next buttons call (runtime/bookmark-navigation.js) --
  // never a second Bottom-only algorithm. With a Bookmark selected,
  // navigation is relative to *that Bookmark's own cycle* (a synthetic
  // single-cycle range), matching the issue's "Previous/Next relative to
  // the selected Bookmark" requirement; with none selected, it falls back
  // to the same Timeline range the Ribbon itself uses.
  const navigate = (direction: -1 | 1) => {
    const referenceRange = bookmark ? { start: bookmark.start, end: bookmark.start + 1 } : range;
    const next = findAdjacentBookmark(document.bookmarks, referenceRange, direction);
    if (next) onNavigateBookmark(next.start, next.id);
  };
  // #422: Draft -> Apply -- typing into Name/Cycle/Comment never touches
  // Canonical (editName/editStart/editComment are local state, submitted
  // only via the form's Apply button); `hasChanges` additionally disables
  // Apply when the draft is byte-for-byte identical to the committed
  // Bookmark, so a no-op Apply can't manufacture an empty History entry.
  const hasChanges = bookmark !== undefined && (editName !== bookmark.name || editStart !== bookmark.start || editComment !== (bookmark.comment ?? ""));
  const containingGroups = bookmark === undefined ? [] : document.timeGroups.filter((group) => group.presentation?.collapsed && bookmark.start >= group.start && bookmark.start < group.end);
  const expandAndJump = () => { for (const group of containingGroups) commands.updateTimeGroupPresentation(group.id, { ...(group.presentation ?? {}), collapsed: false, foldStyle: "none", foldLabel: group.presentation?.foldLabel || group.name }); onReveal(bookmark!.start); };
  const createHasChanges = name !== "Bookmark" || start !== 0 || comment !== "";
  return <section className="bookmark-editor-panel" data-testid="bookmark-editor-panel" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <header>
      <button type="button" aria-label="Previous bookmark" disabled={document.bookmarks.length === 0} onClick={() => navigate(-1)}>Previous</button>
      <button type="button" aria-label="Next bookmark" disabled={document.bookmarks.length === 0} onClick={() => navigate(1)}>Next</button>
      <strong>{bookmark ? `Editing: ${bookmark.name}` : "Bookmark Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button>{bookmark && <><button type="button" onClick={() => onReveal(bookmark.start)}>Reveal</button>{containingGroups.length > 0 && <button type="button" data-testid="bookmark-expand-and-jump" onClick={expandAndJump}>Expand and Jump</button>}<button type="button" onClick={duplicate}>Duplicate</button><button type="button" className="danger" data-testid="delete-bottom-bookmark" onClick={onDelete}>Delete Bookmark</button></>}</header>
    {bookmark
      ? <>
          <form id="bookmark-properties-form" onSubmit={(event) => { event.preventDefault(); if (!hasChanges) return; commands.updateBookmark({ bookmarkId: bookmark.id, name: editName.trim() || "Bookmark", start: editStart, comment: editComment }); }}>
            <label>Name<input aria-label="Bottom Bookmark name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <label>Cycle<input aria-label="Bottom Bookmark cycle" type="number" min="0" max={document.timeline.cycleCount - 1} value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label>
            <label>Comment<input aria-label="Bottom Bookmark comment" value={editComment} onChange={(event) => setEditComment(event.target.value)} /></label>
          </form>
          <div className="bottom-sticky-actions">
            {hasChanges && <DraftStatus testId="bottom-bookmark-unapplied" />}
            <span className="bottom-sticky-buttons">
              <button type="button" data-testid="cancel-bottom-bookmark" onClick={onCancel}>Cancel</button>
              <button type="submit" form="bookmark-properties-form" data-testid="apply-bottom-bookmark" disabled={!hasChanges}>Apply Changes</button>
            </span>
          </div>
        </>
      : <>
          {/* Kept the same two-block shape (fields form + sticky action row)
             as the editing branch above -- not just for visual consistency,
             but because collapsing them back into one <form> here made the
             Bottom panel's total height jump by the sticky bar's height at
             the exact moment a Bookmark gets selected (e.g. the first click
             half of a double-click on a list row), shifting every row below
             it out from under an in-flight native double-click gesture and
             silently swallowing the second click. Same fixed height in both
             branches keeps row positions stable across that transition. */}
          <form id="bookmark-create-form" onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("bookmark", document) as BookmarkId; const result = commands.createBookmark({ id, name: name.trim() || "Bookmark", start, ...(comment ? { comment } : {}) }); if (result.ok) onSelect(id); }}>
            <label>Name<input aria-label="New Bottom Bookmark name" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Cycle<input aria-label="New Bottom Bookmark cycle" type="number" min="0" max={document.timeline.cycleCount - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
            <label>Comment<input aria-label="New Bottom Bookmark comment" value={comment} onChange={(event) => setComment(event.target.value)} /></label>
          </form>
          <div className="bottom-sticky-actions">
            {createHasChanges && <DraftStatus testId="bottom-bookmark-create-unapplied" />}
            <span className="bottom-sticky-buttons">
              <button type="button" data-testid="cancel-bottom-bookmark-create" onClick={onCancel}>Cancel</button>
              <button type="submit" form="bookmark-create-form" disabled={!createHasChanges}>Create Bookmark</button>
            </span>
          </div>
        </>}
    <div className="bookmark-list" data-testid="bookmark-list" role="table" aria-label="Bookmarks">
      <div className="bookmark-list-header" role="row"><span>Marker</span><span>Name</span><span>Cycle</span><span>Comment</span></div>
      {ordered.map((item) => <button type="button" role="row" key={item.id} data-testid={`bookmark-row-${item.id}`} data-selected={String(item.id === bookmark?.id)} onClick={() => onSelect(item.id)} onDoubleClick={() => onReveal(item.start)}>
        <span aria-hidden="true">◆</span><b>{item.name}</b><span>{item.start}</span><span>{item.comment ?? ""}</span>
      </button>)}
      {ordered.length === 0 && <p className="inspector-note">No Bookmarks yet.</p>}
    </div>
  </section>;
}
