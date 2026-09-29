import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Bookmark, CanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { InspectorSection, InspectorFooter } from "./inspector-section.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";
import { MiniMap } from "./minimap.js";
import { reconcileExternalDraftFields } from "./runtime/external-draft-reconciliation.js";

/** Inspector redesign, Section 1/2: Bookmark had NO Inspector representation
 * at all before this pass -- only the Bottom Editor (bookmark-editor.tsx)
 * could edit one. This mirrors that file's own Draft/Apply contract
 * (`bookmark.update`, disabled-when-unchanged Apply) rather than inventing
 * a second mutation path; creation/navigation/list stay Bottom-only, this
 * is purely a confirm/edit surface for whichever Bookmark is selected. */
export function InspectorBookmarkEditor({ bookmark, document, viewport, commands, onDelete, onCancel, onClose }: { readonly bookmark: Bookmark; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly commands: Pick<EditorSurfaceCommandController, "updateBookmark">; readonly onDelete: () => void; readonly onCancel: () => void; readonly onClose: () => void }) {
  const [editName, setEditName] = useState(bookmark.name);
  const [editStart, setEditStart] = useState(bookmark.start);
  const [editComment, setEditComment] = useState(bookmark.comment ?? "");
  const { state: sections, toggle } = useInspectorAccordion("bookmark", { general: true });
  // Same-entity external Canonical updates rebase clean fields and preserve dirty ones (Legend/Annotation contract); a different
  // Bookmark resets the whole draft; a field edited locally AND changed externally is an explicit conflict.
  const draft = { name: editName, start: editStart, comment: editComment };
  const canonicalDraft = { name: bookmark.name, start: bookmark.start, comment: bookmark.comment ?? "" };
  const baseRef = useRef(canonicalDraft);
  const entityRef = useRef(bookmark.id);
  const [externalConflict, setExternalConflict] = useState<readonly string[]>([]);
  useEffect(() => {
    if (entityRef.current !== bookmark.id) {
      entityRef.current = bookmark.id;
      baseRef.current = canonicalDraft;
      setEditName(canonicalDraft.name); setEditStart(canonicalDraft.start); setEditComment(canonicalDraft.comment);
      setExternalConflict([]);
      return;
    }
    const resolution = reconcileExternalDraftFields(baseRef.current, draft, canonicalDraft);
    if (resolution.value.name !== editName) setEditName(resolution.value.name);
    if (resolution.value.start !== editStart) setEditStart(resolution.value.start);
    if (resolution.value.comment !== editComment) setEditComment(resolution.value.comment);
    baseRef.current = resolution.base;
    const conflicts = resolution.conflicts.map(String);
    setExternalConflict((current) => current.join() === conflicts.join() ? current : conflicts);
  }, [bookmark.id, bookmark.name, bookmark.start, bookmark.comment]);
  const reloadLatest = () => { setEditName(canonicalDraft.name); setEditStart(canonicalDraft.start); setEditComment(canonicalDraft.comment); baseRef.current = canonicalDraft; setExternalConflict([]); };
  const keepDraft = () => { baseRef.current = canonicalDraft; setExternalConflict([]); };
  const changedFields = [editName !== bookmark.name, editStart !== bookmark.start, editComment !== (bookmark.comment ?? "")];
  const changeCount = changedFields.filter(Boolean).length;
  const hasChanges = changeCount > 0;
  const apply = (event?: React.FormEvent) => { event?.preventDefault(); if (!hasChanges || externalConflict.length > 0) return; commands.updateBookmark({ bookmarkId: bookmark.id, name: editName.trim() || "Bookmark", start: editStart, comment: editComment }); };
  return <aside className="inspector" data-testid="inspector" data-inspector-context="bookmark" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader kind="Bookmark" title={bookmark.name} detail={`Cycle ${bookmark.start}`} />
    <form className="inspector-bookmark-properties" aria-label="Inspector Bookmark" onSubmit={apply}>
      <InspectorSection sectionId="general" title="General" open={sections.general ?? true} onToggle={() => toggle("general")}>
        <label>Name<input aria-label="Inspector bookmark name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
        <label>Cycle<input aria-label="Inspector bookmark cycle" type="number" min="0" value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label>
        <label>Comment<input aria-label="Inspector bookmark comment" value={editComment} onChange={(event) => setEditComment(event.target.value)} /></label>
      </InspectorSection>
      {externalConflict.length > 0 && <div role="alert" data-testid="bookmark-draft-conflict"><span>Bookmark changed elsewhere ({externalConflict.join(", ")}). Reload the latest values or keep your draft before applying.</span><div><button type="button" onClick={reloadLatest}>Reload latest</button><button type="button" onClick={keepDraft}>Keep my draft</button></div></div>}
      <section><button type="button" className="danger" onClick={onDelete}>Delete Bookmark</button></section>
      <InspectorFooter changeCount={changeCount} onCancel={onCancel} onApply={apply} applyDisabled={!hasChanges || externalConflict.length > 0} applyTestId="apply-inspector-bookmark" />
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}
