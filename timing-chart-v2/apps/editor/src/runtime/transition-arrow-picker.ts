import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { SemanticAnchor, Annotation, AnnotationId, CanonicalDocument } from "@timing-chart-v2/schema";
import type { TimelineGeometryOwner } from "./timeline-geometry-owner.js";
import { nextCommandId } from "../command-id.js";
import { nextEntityId } from "../entity-id.js";

type Geometry = Pick<TimelineGeometryOwner, "screenToLocal" | "currentSnapIndex">;

export type TransitionArrowPickerContext = Readonly<{
  rendererHost: HTMLElement;
  geometry: Geometry;
  getZoom: () => number;
  getDocument: () => CanonicalDocument;
  execute: (command: SemanticCommand) => { readonly ok: boolean };
  selectAnnotation: (id: AnnotationId) => void;
  publishState: () => void;
  setProblem: (message: string) => void;
  setStatus: (status: "idle" | "from" | "to") => void;
}>;

/** Owns the two-click lifecycle for creating a transition-anchored annotation. */
export class TransitionArrowPicker {
  #pending: "armed" | SemanticAnchor | undefined;
  #annotationType: "arrow" | "dependency" = "arrow";

  constructor(private readonly context: TransitionArrowPickerContext) {}

  arm = (annotationType: "arrow" | "dependency"): void => {
    this.#pending = "armed";
    this.#annotationType = annotationType;
    this.context.setStatus("from");
    this.context.rendererHost.dataset.arrowPick = "from";
  };

  get pending(): "armed" | SemanticAnchor | undefined { return this.#pending; }

  clear = (): void => { this.#pending = undefined; };

  reset = (): void => {
    this.clear();
    this.#annotationType = "arrow";
  };

  handleClick = (event: MouseEvent): boolean => {
    if (!this.#pending || !(event.target instanceof Element) || !event.target.closest(
      "[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']",
    )) return false;
    const waveLayer = this.context.rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
    if (!waveLayer) return true;
    const bounds = waveLayer.getBoundingClientRect();
    const zoom = this.context.getZoom();
    const localPointer = this.context.geometry.screenToLocal({ x: event.clientX - bounds.left, y: 0 }, zoom);
    const snap = this.context.geometry.currentSnapIndex().nearest(
      { x: localPointer.x, y: event.clientY - bounds.top },
      12 / zoom,
      ["clock-edge", "signal-transition", "bus-transition"],
    );
    this.context.publishState();
    if (!snap) {
      this.context.setProblem("No rendered transition is within the 12 px snap tolerance.");
      return true;
    }
    if (this.#pending === "armed") {
      this.#pending = snap.anchor;
      this.context.setStatus("to");
      this.context.rendererHost.dataset.arrowPick = "to";
      this.context.rendererHost.dataset.snapKind = snap.kind;
      return true;
    }
    const annotation: Annotation = {
      id: nextEntityId("annotation", this.context.getDocument()) as AnnotationId,
      type: this.#annotationType,
      label: "Transition",
      visible: true,
      color: "#d04a36",
      from: this.#pending,
      to: snap.anchor,
      lineType: "straight",
      arrowhead: "end",
    };
    const result = this.context.execute({ id: nextCommandId("annotation_transition_arrow"), type: "annotation.create", annotation });
    if (result.ok) this.context.selectAnnotation(annotation.id);
    this.reset();
    this.context.setStatus("idle");
    delete this.context.rendererHost.dataset.arrowPick;
    this.context.rendererHost.dataset.snapKind = snap.kind;
    return true;
  };
}
