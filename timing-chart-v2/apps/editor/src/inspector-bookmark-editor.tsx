import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { Bookmark, CanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { InspectorSection, InspectorFooter } from "./inspector-section.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";
import { MiniMap } from "./minimap.js";

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
  useEffect(() => {
    setEditName(bookmark.name);
    setEditStart(bookmark.start);
    setEditComment(bookmark.comment ?? "");
  }, [bookmark.id, bookmark.name, bookmark.start, bookmark.comment]);
  const changedFields = [editName !== bookmark.name, editStart !== bookmark.start, editComment !== (bookmark.comment ?? "")];
  const changeCount = changedFields.filter(Boolean).length;
  const hasChanges = changeCount > 0;
  const apply = (event?: React.FormEvent) => { event?.preventDefault(); if (!hasChanges) return; commands.updateBookmark({ bookmarkId: bookmark.id, name: editName.trim() || "Bookmark", start: editStart, comment: editComment }); };
  return <aside className="inspector" data-testid="inspector" data-inspector-context="bookmark" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader kind="Bookmark" title={bookmark.name} detail={`Cycle ${bookmark.start}`} />
    <form className="inspector-bookmark-properties" aria-label="Inspector Bookmark" onSubmit={apply}>
      <InspectorSection sectionId="general" title="General" open={sections.general ?? true} onToggle={() => toggle("general")}>
        <label>Name<input aria-label="Inspector bookmark name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
        <label>Cycle<input aria-label="Inspector bookmark cycle" type="number" min="0" value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label>
        <label>Comment<input aria-label="Inspector bookmark comment" value={editComment} onChange={(event) => setEditComment(event.target.value)} /></label>
      </InspectorSection>
      <section><button type="button" className="danger" onClick={onDelete}>Delete Bookmark</button></section>
      <InspectorFooter changeCount={changeCount} onCancel={onCancel} onApply={apply} applyDisabled={!hasChanges} applyTestId="apply-inspector-bookmark" />
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}
