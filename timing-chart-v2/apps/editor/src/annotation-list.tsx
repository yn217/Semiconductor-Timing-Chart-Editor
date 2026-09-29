import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Annotation,
  AnnotationId,
  CanonicalDocument,
} from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { annotationPropertiesBase } from "./annotation-style-command.js";
import { formatAnnotationAnchor } from "./annotation-anchor-format.js";

const ANNOTATION_ROW_HEIGHT = 27;
const ANNOTATION_HEADER_HEIGHT = 25;
const ANNOTATION_OVERSCAN = 8;

/** Doubles as the "selection pane" PowerPoint offers for objects: every
 * Annotation, with a visibility toggle per row, in the same table this
 * Bottom Editor already uses for select-by-row -- no separate panel added.
 * Visual Reference pass (#426): columns trimmed to the reference's own
 * recommended set (ID/Type/Label/Start/End/Color/Visible) -- the previous
 * Target/X/Y columns are dropped (Target was always the hardcoded literal
 * "canvas"; X/Y duplicated the Label offset fields already editable in the
 * Edit panel) to fit this table into a narrower List column instead of
 * forcing an 880px-wide horizontal scroll inside it. */
export function AnnotationList({
  annotations,
  selectedId,
  document,
  onSelect,
  commands,
}: {
  readonly annotations: readonly Annotation[];
  readonly selectedId: AnnotationId | undefined;
  readonly document: Pick<CanonicalDocument, "signals">;
  readonly onSelect: (id: AnnotationId, additive?: boolean) => void;
  readonly commands: Pick<
    EditorSurfaceCommandController,
    "updateAnnotationProperties"
  >;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const signalNames = useMemo(() => new Map(document.signals.map((signal) => [signal.id, signal.display.name])), [document.signals]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(320);
  const firstVisible = Math.max(0, Math.floor(Math.max(0, scrollTop - ANNOTATION_HEADER_HEIGHT) / ANNOTATION_ROW_HEIGHT) - ANNOTATION_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ANNOTATION_ROW_HEIGHT) + ANNOTATION_OVERSCAN * 2;
  const lastVisible = Math.min(annotations.length, firstVisible + visibleCount);
  const visibleAnnotations = annotations.slice(firstVisible, lastVisible);
  const annotationOrderKey = useMemo(() => annotations.map((item) => item.id).join("\u0000"), [annotations]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const updateHeight = () => setViewportHeight(element.clientHeight);
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [annotationOrderKey]);

  useEffect(() => {
    const selectedIndex = selectedId === undefined ? -1 : annotations.findIndex((item) => item.id === selectedId);
    if (selectedIndex < 0 || !listRef.current) return;
    const top = ANNOTATION_HEADER_HEIGHT + selectedIndex * ANNOTATION_ROW_HEIGHT;
    const bottom = top + ANNOTATION_ROW_HEIGHT;
    const viewTop = listRef.current.scrollTop;
    const viewBottom = viewTop + listRef.current.clientHeight;
    if (top < viewTop) listRef.current.scrollTop = top;
    else if (bottom > viewBottom) listRef.current.scrollTop = bottom - listRef.current.clientHeight;
  }, [annotations, selectedId]);

  return (
    <div
      ref={listRef}
      className="annotation-list"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      role="table"
      aria-label="Annotations"
      aria-rowcount={annotations.length + 1}
      data-testid="annotation-list"
    >
      {/* Transaction Mode GUI realignment (Visual Quality pass): the last
        column is an 18px decorative swatch (`aria-hidden`, no text content
        of its own) -- the same fixed width is too narrow for the word
        "Color" as a header label, which was clipping to "C..." via the
        row's own ellipsis rule. Matches the leading visibility-toggle
        column's own empty header cell rather than forcing text into a
        column that was never meant to hold any. */}
      <div className="annotation-list-row annotation-list-header" role="row">
        <span />
        <span>#</span>
        <span>Type</span>
        <span>Label / Text</span>
        <span>Start</span>
        <span>End</span>
        <span aria-hidden="true" />
      </div>
      <div style={{ height: firstVisible * ANNOTATION_ROW_HEIGHT }} aria-hidden="true" />
      {visibleAnnotations.map((item, visibleIndex) => {
        const index = firstVisible + visibleIndex;
        return (
        <div
          className="annotation-list-row"
          role="row"
          tabIndex={0}
          key={item.id}
          data-annotation-list-id={item.id}
          data-annotation-row={item.id}
          data-selected={String(item.id === selectedId)}
          aria-selected={item.id === selectedId}
          aria-rowindex={index + 2}
          aria-label={`Select annotation ${item.label || item.type}`}
          onClick={(event) => onSelect(item.id, event.ctrlKey || event.metaKey)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(item.id);
              return;
            }
            if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? annotations.length - 1
                    : index + (event.key === "ArrowDown" ? 1 : -1);
              const nextItem = annotations[nextIndex];
              if (nextItem) {
                onSelect(nextItem.id);
                requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-annotation-list-id="${CSS.escape(nextItem.id)}"]`)?.focus());
              }
            }
          }}
        >
          <button
            type="button"
            className="annotation-list-visibility"
            aria-label={
              item.visible
                ? `Hide ${item.label || item.type}`
                : `Show ${item.label || item.type}`
            }
            aria-pressed={item.visible}
            data-testid={`annotation-list-visibility-${item.id}`}
            onClick={(event) => {
              event.stopPropagation();
              commands.updateAnnotationProperties({
                annotationId: item.id,
                ...annotationPropertiesBase(item),
                visible: !item.visible,
                ...(item.color === undefined ? {} : { color: item.color }),
                ...(item.lineType === undefined
                  ? {}
                  : { lineType: item.lineType }),
                ...(item.arrowhead === undefined
                  ? {}
                  : { arrowhead: item.arrowhead }),
                ...(item.sourceSignalId === undefined
                  ? {}
                  : { sourceSignalId: item.sourceSignalId }),
                ...(item.traceOffsetCycles === undefined
                  ? {}
                  : { traceOffsetCycles: item.traceOffsetCycles }),
                ...(item.opacity === undefined
                  ? {}
                  : { opacity: item.opacity }),
                ...(item.style === undefined ? {} : { style: item.style }),
                ...(item.measurement === undefined
                  ? {}
                  : { measurement: item.measurement }),
                ...(item.measurementLayout === undefined
                  ? {}
                  : { measurementLayout: item.measurementLayout }),
                ...(item.verticalSpan === undefined ? {} : { verticalSpan: item.verticalSpan }),
                ...(item.positionMode === undefined ? {} : { positionMode: item.positionMode }),
              });
            }}
          >
            <RibbonIcon name={item.visible ? "i-eye" : "i-eye-off"} />
          </button>
          <span className="annotation-list-index">{index + 1}</span>
          <span className="annotation-list-type">{item.type}</span>
          <span className="annotation-list-label">
            {item.label || "(untitled)"}
          </span>
          <span className="annotation-list-anchor" title={`Start: ${formatAnnotationAnchor(item.start ?? item.from ?? item.anchor, signalNames)}`} aria-label={`Start: ${formatAnnotationAnchor(item.start ?? item.from ?? item.anchor, signalNames)}`}>
            {formatAnnotationAnchor(item.start ?? item.from ?? item.anchor, signalNames)}
          </span>
          <span className="annotation-list-anchor" title={`End: ${formatAnnotationAnchor(item.end ?? item.to, signalNames)}`} aria-label={`End: ${formatAnnotationAnchor(item.end ?? item.to, signalNames)}`}>
            {formatAnnotationAnchor(item.end ?? item.to, signalNames)}
          </span>
          <span
            className="annotation-list-color"
            style={{ background: item.color ?? "transparent" }}
            aria-hidden="true"
          />
        </div>
        );
      })}
      <div style={{ height: Math.max(0, annotations.length - lastVisible) * ANNOTATION_ROW_HEIGHT }} aria-hidden="true" />
    </div>
  );
}
