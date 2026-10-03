import type { Annotation, AnnotationGroup, AnnotationGroupId, AnnotationId, CanonicalDocument } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";
import { createEntityIdAllocator } from "../entity-id.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { SelectionOwner } from "./use-selection-owner.js";

/**
 * #864 multi-Annotation clipboard payload. `groups` is the source Annotation Group membership restricted to the copied set
 * (captured at Copy/Cut time so a later edit of the source group does not change what is pasted).
 *
 * Paste/Duplicate semantics (mirrors single Annotation paste and Signal Group paste):
 *  - every Annotation gets a fresh stable ID from the operation-scoped allocator; content and placement are unchanged
 *    (single Annotation paste applies no offset either), so Signal / Bookmark references stay as in the source document;
 *  - Annotations do not reference other Annotations, so the only internal reference is Annotation Group membership:
 *    a source group with >= 2 copied members is recreated as a NEW group (fresh ID, same name) over the pasted copies,
 *    like Signal Group paste creates a new group; a group with < 2 copied members cannot exist, so those copies are pasted ungrouped;
 *  - the whole set is ONE `annotation.bulkCreate` (one History entry); validation/resource-budget rejection is atomic.
 */
export type AnnotationClipboard = Readonly<{ annotations: readonly Annotation[]; groups: readonly AnnotationGroup[] }>;

/** Selected Annotations in document (z-)order; O(N) over the collection. */
export function selectedAnnotations(document: CanonicalDocument, ids: ReadonlySet<AnnotationId>): Annotation[] {
  return ids.size === 0 ? [] : document.annotations.filter((annotation) => ids.has(annotation.id));
}

export function captureAnnotationClipboard(document: CanonicalDocument, annotations: readonly Annotation[]): AnnotationClipboard {
  const ids = new Set(annotations.map((annotation) => annotation.id));
  const groups = (document.annotationGroups ?? []).flatMap((group) => {
    const annotationIds = group.annotationIds.filter((id) => ids.has(id));
    return annotationIds.length >= 2 ? [{ ...group, annotationIds }] : [];
  });
  return { annotations, groups };
}

export function remapAnnotationClipboard(document: CanonicalDocument, clipboard: AnnotationClipboard): AnnotationClipboard {
  const allocate = createEntityIdAllocator(document);
  const newIdByOld = new Map<AnnotationId, AnnotationId>();
  const annotations = clipboard.annotations.map((source) => {
    const id = allocate("annotation") as AnnotationId;
    newIdByOld.set(source.id, id);
    return { ...source, id };
  });
  const groups = clipboard.groups.map((group) => ({ ...group, id: allocate("annotationGroup") as AnnotationGroupId, annotationIds: group.annotationIds.map((id) => newIdByOld.get(id)!) }));
  return { annotations, groups };
}

export const annotationClipboardStatus = (verb: string, annotations: readonly Annotation[]) => annotations.length === 1
  ? `${verb} ${annotations[0]!.label || annotations[0]!.type} annotation`
  : `${verb} ${annotations.length} annotations`;

/** One atomic bulk create for Paste / Duplicate; selection becomes the created set. Returns the status text. */
export function createAnnotationsFromClipboard(application: EditorApplicationOwner, selection: SelectionOwner, clipboard: AnnotationClipboard, operation: "paste" | "duplicate"): string {
  const created = remapAnnotationClipboard(application.runtime.session.current().getSnapshot().document, clipboard);
  const result = application.execute({ id: nextCommandId(`${operation}_annotations`), type: "annotation.bulkCreate", annotations: created.annotations, ...(created.groups.length > 0 ? { groups: created.groups } : {}) });
  if (!result.ok) return `${operation === "paste" ? "Paste" : "Duplicate"} rejected: ${result.problems[0]?.message ?? result.reason}`;
  const ids = created.annotations.map((annotation) => annotation.id);
  selection.selectAnnotations(new Set(ids), ids[0]);
  return annotationClipboardStatus(operation === "paste" ? "Pasted" : "Duplicated", created.annotations);
}

/** One atomic bulk delete for Cut; the clipboard is replaced only when the delete really happened. */
export function cutAnnotations(application: EditorApplicationOwner, annotations: readonly Annotation[]) {
  return application.execute({ id: nextCommandId("cut_annotations"), type: "annotation.bulkDelete", annotationIds: annotations.map((annotation) => annotation.id) });
}
