import type {
  Annotation,
  AnnotationId,
  SemanticAnchor,
} from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { annotationPropertiesBase } from "./annotation-style-command.js";
import { useEffect, useRef, useState } from "react";

const ANNOTATION_ROW_HEIGHT = 27;
const ANNOTATION_HEADER_HEIGHT = 25;
const ANNOTATION_OVERSCAN = 8;

/** Shared read-only anchor formatter -- used by both this list's Start/End
 * columns and the Bottom Annotation Editor's own Start/End summary (Visual
 * Reference pass, #426), so the two never drift into showing the same
 * anchor two different ways. */
export function annotationAnchorText(
  anchor: SemanticAnchor | undefined,
): string {
  return anchor ? `${anchor.signalId ?? "cycle"} @ ${anchor.cycle}` : "—";
}

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
  onSelect,
  commands,
}: {
  readonly annotations: readonly Annotation[];
  readonly selectedId: AnnotationId | undefined;
  readonly onSelect: (id: AnnotationId) => void;
  readonly commands: Pick<
    EditorSurfaceCommandController,
    "updateAnnotationProperties"
  >;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const viewportHeight = listRef.current?.clientHeight ?? 320;
  const firstVisible = Math.max(0, Math.floor(Math.max(0, scrollTop - ANNOTATION_HEADER_HEIGHT) / ANNOTATION_ROW_HEIGHT) - ANNOTATION_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ANNOTATION_ROW_HEIGHT) + ANNOTATION_OVERSCAN * 2;
  const lastVisible = Math.min(annotations.length, firstVisible + visibleCount);
  const visibleAnnotations = annotations.slice(firstVisible, lastVisible);

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
          aria-label={`Select annotation ${item.label || item.type}`}
          onClick={() => onSelect(item.id)}
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
          <span>
            {annotationAnchorText(item.start ?? item.from ?? item.anchor)}
          </span>
          <span>{annotationAnchorText(item.end ?? item.to)}</span>
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
