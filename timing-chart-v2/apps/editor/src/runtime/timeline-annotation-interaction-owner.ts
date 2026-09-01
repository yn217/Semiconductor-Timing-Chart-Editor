import type { ImmutableSnapIndex, LocalGeometryMap, Point } from "@timing-chart-v2/geometry";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { annotationFields } from "./annotation-overlays.js";
import { withAddedOffset, withSnapOffset } from "./anchor-offset.js";
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
  renderer: Pick<TimingChartRenderer, "updateSnapGuide">;
  timelineGeometry: AnnotationGeometryPort;
  documentEpoch: Pick<DocumentEpoch, "current" | "isCurrent">;
  getZoom: () => number;
  getDocument: () => CanonicalDocument;
  getProjection: () => RenderProjection;
  isSnapEnabled: () => boolean;
  execute: (command: SemanticCommand) => void;
  publishState: () => void;
}>;

type Drag = Readonly<{
  annotationId: string;
  field?: AnnotationField;
  label: boolean;
  startX: number;
  startY: number;
  owner: HTMLElement;
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
    const fieldElement = event.target.closest<HTMLElement>("[data-role='annotation-handle'][data-annotation-field]");
    const label = event.target.closest<HTMLElement>("[data-annotation-label='true']") !== null;
    const field = fieldElement?.dataset.annotationField as AnnotationField | undefined;
    this.#drag = {
      annotationId: owner.dataset.annotationId,
      ...(field ? { field } : {}),
      label,
      startX: event.clientX,
      startY: event.clientY,
      owner,
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
    drag.owner.style.translate = `${screenDx}px ${dy}px`;
    if (!drag.field || drag.label) return;
    const document = this.context.getDocument();
    const annotation = document.annotations.find((item) => item.id === drag.annotationId);
    const anchor = annotation?.[drag.field];
    const point = resolveAnchorPoint(anchor, document, this.context.getProjection(), this.context.timelineGeometry.geometryMaps, this.context.timelineGeometry.displayMapping, this.context.timelineGeometry.presentationScale);
    if (!annotation || !anchor || !point) return;
    const desired = { x: point.x + screenDx / currentZoom, y: point.y + dy };
    const snap = this.context.isSnapEnabled() ? this.context.timelineGeometry.currentSnapIndex().nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
    this.context.publishState();
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
    const currentZoom = this.context.getZoom();
    const dx = Math.round(this.context.timelineGeometry.screenToLocal({ x: rawScreenDx, y: 0 }, currentZoom).x);
    const dy = Math.round(event.clientY - drag.startY);
    drag.owner.style.translate = "";
    this.#drag = undefined;
    this.context.renderer.updateSnapGuide();
    if (dx === 0 && dy === 0) return;
    const annotation = this.context.getDocument().annotations.find((item) => item.id === drag.annotationId);
    if (!annotation) return;
    if (drag.label) {
      this.context.execute({ id: nextCommandId("annotation_label_drag"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: (annotation.labelOffset?.x ?? 0) + dx, y: (annotation.labelOffset?.y ?? -14) + dy } });
      return;
    }
    if (!drag.field) {
      this.context.execute({ id: nextCommandId("annotation_move"), type: "annotation.translateOffsets", annotationId: annotation.id, delta: { x: dx, y: dy } });
      return;
    }
    const field = drag.field ?? annotationFields.find((key) => annotation[key] !== undefined);
    const anchor = field ? annotation[field] : undefined;
    const point = resolveAnchorPoint(anchor, this.context.getDocument(), this.context.getProjection(), this.context.timelineGeometry.geometryMaps, this.context.timelineGeometry.displayMapping, this.context.timelineGeometry.presentationScale);
    if (!field || !anchor || !point) return;
    const desired = { x: point.x + rawScreenDx / currentZoom, y: point.y + dy };
    const snap = this.context.isSnapEnabled() ? this.context.timelineGeometry.currentSnapIndex().nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
    this.context.publishState();
    const nextAnchor = snap ? withSnapOffset(snap.anchor, desired, snap.point) : withAddedOffset(anchor, dx, dy);
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
    if (!annotation || !field || !anchor) return false;
    event.preventDefault();
    this.context.execute({ id: nextCommandId("annotation_nudge"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: withAddedOffset(anchor, movement.x, movement.y) });
    return true;
  };

  cancel = (): void => {
    if (this.#drag) this.#drag.owner.style.translate = "";
    this.#drag = undefined;
    this.context.renderer.updateSnapGuide();
    delete this.context.rendererHost.dataset.snapKind;
    delete this.context.rendererHost.dataset.snapDistance;
    delete this.context.rendererHost.dataset.snapCycle;
  };
}
