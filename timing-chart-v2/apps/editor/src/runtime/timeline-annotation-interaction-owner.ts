import type { ImmutableSnapIndex, LocalGeometryMap, Point } from "@timing-chart-v2/geometry";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";
import type { AnnotationId, CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { annotationFields, projectAnnotationOverlays } from "./annotation-overlays.js";
import { annotationOffsetDeltaFromScreen, withAddedOffset, withSnapOffset } from "./anchor-offset.js";
import { preferredSnapKinds } from "./snap-policy.js";
import { normalizeSnapDistance } from "./snap-distance.js";
import { resolveAnchorPoint } from "../resolve-anchor-point.js";
import { nextCommandId } from "../command-id.js";
import type { DocumentEpoch } from "./document-epoch.js";

type AnnotationField = typeof annotationFields[number];

/** Read-only slice of TimelineGeometryOwner this interaction needs. */
export type AnnotationGeometryPort = Readonly<{
  screenToLocal: (point: Point, zoom: number) => Point;
  presentationScale: number;
  geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>;
  displayMapping: DisplayTimeMapping;
  currentSnapIndex: () => ImmutableSnapIndex;
}>;

export type AnnotationInteractionContext = Readonly<{
  rendererHost: HTMLElement;
  renderer: Pick<TimingChartRenderer, "updateSnapGuide" | "updateOverlays">;
  timelineGeometry: AnnotationGeometryPort;
  documentEpoch: Pick<DocumentEpoch, "current" | "isCurrent">;
  getZoom: () => number;
  getDocument: () => CanonicalDocument;
  getProjection: () => RenderProjection;
  isSnapEnabled: () => boolean;
  execute: (command: SemanticCommand) => void;
  executeBatch: (commands: readonly SemanticCommand[]) => void;
  publishState: () => void;
  /** Given the annotation actually picked, returns every annotation id that
   * should move together with it -- its AnnotationGroup's full membership if
   * grouped, else the current multi-selection if the pick is part of one,
   * else just itself. Only consulted for a whole-annotation move (no field/
   * label drag -- those stay single-annotation, an anchor handle or label
   * only ever belongs to the one annotation it's dragged from). */
  getDragTargets: (annotationId: string) => ReadonlySet<string>;
}>;

type Drag = Readonly<{
  annotationIds: ReadonlySet<string>;
  field?: AnnotationField;
  label: boolean;
  startX: number;
  startY: number;
  owners: ReadonlyMap<string, HTMLElement>;
  epoch: number;
}>;

/** Owns the complete pointer/keyboard lifecycle for annotation drag/snap/drop. */
export class AnnotationInteractionOwner {
  #drag: Drag | undefined;

  constructor(private readonly context: AnnotationInteractionContext) {}

  onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const owner = event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]");
    if (!owner?.dataset.annotationId) return;
    const primaryId = owner.dataset.annotationId;
    if (this.context.getDocument().annotations.find((item) => item.id === primaryId)?.locked) return;
    const fieldElement = event.target.closest<HTMLElement>("[data-role='annotation-handle'][data-annotation-field]");
    const label = event.target.closest<HTMLElement>("[data-annotation-label='true']") !== null;
    const field = fieldElement?.dataset.annotationField as AnnotationField | undefined;
    const dragIds = field || label ? new Set([primaryId]) : this.context.getDragTargets(primaryId);
    const owners = new Map<string, HTMLElement>();
    for (const id of dragIds) {
      const element = id === primaryId ? owner : this.context.rendererHost.querySelector<HTMLElement>(`[data-role='annotation-owner'][data-annotation-id="${id}"]`);
      if (element) owners.set(id, element);
    }
    this.#drag = {
      annotationIds: new Set(owners.keys()),
      ...(field ? { field } : {}),
      label,
      startX: event.clientX,
      startY: event.clientY,
      owners,
      epoch: this.context.documentEpoch.current(),
    };
    this.context.publishState();
    owner.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag) return;
    if (!this.context.documentEpoch.isCurrent(drag.epoch)) { this.cancel(); return; }
    const screenDx = Math.round(event.clientX - drag.startX);
    const currentZoom = this.context.getZoom();
    const dy = Math.round(event.clientY - drag.startY);
    // #421: a whole-annotation move (no field/label -- dragging the body)
    // previews with a cheap CSS translate on the whole owner element, which
    // is correct there since every part of the annotation genuinely moves
    // together. An endpoint-field drag (Arrow/Dependency/Measurement
    // start|end|from|to) must NOT use that same whole-owner translate --
    // it would visually move the *other*, untouched endpoint/handle/body
    // too, which then snaps back to its real (unchanged) position the
    // moment the transform is cleared on commit. That is exactly the
    // reported "grab the tip, the whole arrow appears to move, then the
    // root jumps back on mouse-up" bug. Endpoint drags instead re-run the
    // exact same projectAnnotationOverlays/renderer.updateOverlays path
    // used for committed rendering, against a draft document with only the
    // dragged field's anchor replaced -- the identical geometry algorithm
    // Preview and commit already share, so nothing needs to snap back.
    if (!drag.field || drag.label) for (const owner of drag.owners.values()) owner.style.translate = `${screenDx}px ${dy}px`;
    if (!drag.field || drag.label) return;
    const document = this.context.getDocument();
    const annotation = document.annotations.find((item) => item.id === [...drag.annotationIds][0]);
    const anchor = annotation?.[drag.field];
    const point = resolveAnchorPoint(anchor, document, this.context.getProjection(), this.context.timelineGeometry.geometryMaps, this.context.timelineGeometry.displayMapping, this.context.timelineGeometry.presentationScale);
    if (!annotation || !anchor || !point) return;
    const desired = { x: point.x + screenDx / currentZoom, y: point.y + dy };
    const snap = this.context.isSnapEnabled() ? this.context.timelineGeometry.currentSnapIndex().nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
    this.context.publishState();
    const previewOffsetDelta = annotationOffsetDeltaFromScreen({ x: screenDx, y: dy }, this.context.timelineGeometry.presentationScale, currentZoom);
    const previewAnchor = snap ? withSnapOffset(snap.anchor, desired, snap.point, this.context.timelineGeometry.presentationScale) : withAddedOffset(anchor, previewOffsetDelta.x, previewOffsetDelta.y);
    const previewDocument: CanonicalDocument = { ...document, annotations: document.annotations.map((item) => item.id === annotation.id ? { ...item, [drag.field as AnnotationField]: previewAnchor } : item) };
    this.context.renderer.updateOverlays(projectAnnotationOverlays(previewDocument, this.context.getProjection(), this.context.timelineGeometry.geometryMaps, this.context.timelineGeometry.displayMapping, this.context.timelineGeometry.presentationScale));
    if (!snap) {
      this.context.renderer.updateSnapGuide();
      delete this.context.rendererHost.dataset.snapKind;
      delete this.context.rendererHost.dataset.snapDistance;
      delete this.context.rendererHost.dataset.snapCycle;
      return;
    }
    const row = this.context.getProjection().rowLayout.find((item) => item.rowId === snap.anchor.signalId);
    this.context.renderer.updateSnapGuide({ x: snap.point.x, y: snap.point.y, rowY: row?.y ?? 0, rowHeight: row?.height ?? this.context.getProjection().totalHeight, surfaceHeight: this.context.getProjection().totalHeight, label: `${snap.kind} · cycle ${snap.anchor.cycle}` });
    this.context.rendererHost.dataset.snapKind = snap.kind;
    this.context.rendererHost.dataset.snapDistance = String(normalizeSnapDistance(snap.distance));
    this.context.rendererHost.dataset.snapCycle = String(snap.anchor.cycle);
  };

  onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag) return;
    if (!this.context.documentEpoch.isCurrent(drag.epoch)) { this.cancel(); return; }
    const rawScreenDx = event.clientX - drag.startX;
    const rawScreenDy = event.clientY - drag.startY;
    const currentZoom = this.context.getZoom();
    const offsetDelta = annotationOffsetDeltaFromScreen({ x: rawScreenDx, y: rawScreenDy }, this.context.timelineGeometry.presentationScale, currentZoom);
    const dx = offsetDelta.x;
    const dy = offsetDelta.y;
    for (const owner of drag.owners.values()) owner.style.translate = "";
    this.#drag = undefined;
    this.context.renderer.updateSnapGuide();
    if (dx === 0 && dy === 0) return;
    const document = this.context.getDocument();
    if (!drag.field && !drag.label) {
      // Whole-annotation move: every dragged id (a single annotation, or a
      // whole AnnotationGroup / multi-selection moving together) gets the
      // same delta as one command each, submitted as a single batch so
      // Undo restores the whole group's position in one step.
      const commands: SemanticCommand[] = [...drag.annotationIds].flatMap((id) => document.annotations.some((item) => item.id === id) ? [{ id: nextCommandId("annotation_move"), type: "annotation.translateOffsets", annotationId: id as AnnotationId, delta: { x: dx, y: dy } } satisfies SemanticCommand] : []);
      if (commands.length > 0) this.context.executeBatch(commands);
      return;
    }
    const annotation = document.annotations.find((item) => item.id === [...drag.annotationIds][0]);
    if (!annotation) return;
    if (drag.label) {
      this.context.execute({ id: nextCommandId("annotation_label_drag"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: (annotation.labelOffset?.x ?? 0) + dx, y: (annotation.labelOffset?.y ?? -14) + dy } });
      return;
    }
    const field = drag.field ?? annotationFields.find((key) => annotation[key] !== undefined);
    const anchor = field ? annotation[field] : undefined;
    const point = resolveAnchorPoint(anchor, this.context.getDocument(), this.context.getProjection(), this.context.timelineGeometry.geometryMaps, this.context.timelineGeometry.displayMapping, this.context.timelineGeometry.presentationScale);
    if (!field || !anchor || !point) return;
    const desired = { x: point.x + rawScreenDx / currentZoom, y: point.y + rawScreenDy };
    const snap = this.context.isSnapEnabled() ? this.context.timelineGeometry.currentSnapIndex().nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
    this.context.publishState();
    const nextAnchor = snap ? withSnapOffset(snap.anchor, desired, snap.point, this.context.timelineGeometry.presentationScale) : withAddedOffset(anchor, dx, dy);
    if (snap) {
      this.context.rendererHost.dataset.snapKind = snap.kind;
      this.context.rendererHost.dataset.snapDistance = String(normalizeSnapDistance(snap.distance));
      this.context.rendererHost.dataset.snapCycle = String(snap.anchor.cycle);
    }
    this.context.execute({ id: nextCommandId("annotation_drag"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: nextAnchor });
  };

  get active(): boolean { return this.#drag !== undefined; }

  /** Arrow-key nudge for the focused Annotation's primary anchor. Not a
   * global shortcut (KeyboardShortcutRouter never sees ArrowLeft/Right/Up/
   * Down); callers invoke this after the router declines an event. Returns
   * whether the key was handled. */
  nudge = (event: KeyboardEvent): boolean => {
    if (!(event.target instanceof Element)) return false;
    const owner = event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]");
    const delta = event.shiftKey ? 10 : 1;
    const movement = event.key === "ArrowLeft" ? { x: -delta, y: 0 } : event.key === "ArrowRight" ? { x: delta, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -delta } : event.key === "ArrowDown" ? { x: 0, y: delta } : undefined;
    if (!owner?.dataset.annotationId || !movement) return false;
    const annotation = this.context.getDocument().annotations.find((item) => item.id === owner.dataset.annotationId);
    const field = annotation && annotationFields.find((key) => annotation[key] !== undefined);
    const anchor = field && annotation ? annotation[field] : undefined;
    if (!annotation || !field || !anchor || annotation.locked) return false;
    event.preventDefault();
    this.context.execute({ id: nextCommandId("annotation_nudge"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: withAddedOffset(anchor, movement.x, movement.y) });
    return true;
  };

  cancel = (): void => {
    const drag = this.#drag;
    if (drag) for (const owner of drag.owners.values()) owner.style.translate = "";
    // #421: an endpoint-field drag's preview is rendered via
    // `renderer.updateOverlays` against a draft (uncommitted) document, not
    // a CSS transform -- clearing `owner.style.translate` above (a no-op
    // for this drag mode) does not undo that. Re-render from the real,
    // still-canonical document so a cancelled drag leaves no visible trace
    // of the discarded preview (Canonical/History/Dirty were never
    // touched by the preview in the first place, but the DOM must match).
    if (drag?.field && !drag.label) {
      this.context.renderer.updateOverlays(projectAnnotationOverlays(this.context.getDocument(), this.context.getProjection(), this.context.timelineGeometry.geometryMaps, this.context.timelineGeometry.displayMapping, this.context.timelineGeometry.presentationScale));
    }
    this.#drag = undefined;
    this.context.renderer.updateSnapGuide();
    delete this.context.rendererHost.dataset.snapKind;
    delete this.context.rendererHost.dataset.snapDistance;
    delete this.context.rendererHost.dataset.snapCycle;
  };
}
