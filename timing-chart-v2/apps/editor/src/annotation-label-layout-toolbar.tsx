import { useEffect, useState } from "react";
import { ANNOTATION_LABEL_LINE_HEIGHT, ANNOTATION_LABEL_MAX_WIDTH, type JsonObject } from "@timing-chart-v2/schema";

/** Authored label wrapping settings share the Annotation style draft and are
 * committed by the owning editor's existing Apply command. */
export function AnnotationLabelLayoutToolbar({ style, onChange, idPrefix }: {
  readonly style: JsonObject | undefined;
  readonly onChange: (next: JsonObject) => void;
  readonly idPrefix: string;
}) {
  const wrap = style?.labelWrap !== false;
  const maxWidth = typeof style?.labelMaxWidth === "number" ? style.labelMaxWidth : ANNOTATION_LABEL_MAX_WIDTH.default;
  const lineHeight = typeof style?.lineHeight === "number" ? style.lineHeight : ANNOTATION_LABEL_LINE_HEIGHT.default;
  const [widthDraft, setWidthDraft] = useState(String(maxWidth));
  const [lineHeightDraft, setLineHeightDraft] = useState(String(lineHeight));
  useEffect(() => setWidthDraft(String(maxWidth)), [maxWidth]);
  useEffect(() => setLineHeightDraft(String(lineHeight)), [lineHeight]);
  const commitWidth = () => {
    const parsed = Number(widthDraft);
    if (!Number.isFinite(parsed) || parsed < ANNOTATION_LABEL_MAX_WIDTH.min || parsed > ANNOTATION_LABEL_MAX_WIDTH.max) {
      setWidthDraft(String(maxWidth));
      return;
    }
    if (parsed !== maxWidth) onChange({ ...style, labelMaxWidth: parsed });
  };
  const commitLineHeight = () => {
    const parsed = Number(lineHeightDraft);
    if (!Number.isFinite(parsed) || parsed < ANNOTATION_LABEL_LINE_HEIGHT.min || parsed > ANNOTATION_LABEL_LINE_HEIGHT.max) {
      setLineHeightDraft(String(lineHeight));
      return;
    }
    if (parsed !== lineHeight) onChange({ ...style, lineHeight: parsed });
  };
  return <div className="annotation-label-layout-toolbar" role="group" aria-label="Annotation label layout">
    <label><input type="checkbox" aria-label="Wrap annotation label" data-testid={`${idPrefix}-wrap`} checked={wrap} onChange={(event) => onChange({ ...style, labelWrap: event.target.checked })} />Wrap label</label>
    <label>Maximum width<input type="number" aria-label="Annotation label maximum width" data-testid={`${idPrefix}-max-width`} min={ANNOTATION_LABEL_MAX_WIDTH.min} max={ANNOTATION_LABEL_MAX_WIDTH.max} step={1} value={widthDraft} disabled={!wrap} onChange={(event) => setWidthDraft(event.target.value)} onBlur={commitWidth} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitWidth(); } }} /></label>
    <label>Line spacing<input type="number" aria-label="Annotation label line spacing" data-testid={`${idPrefix}-line-height`} min={ANNOTATION_LABEL_LINE_HEIGHT.min} max={ANNOTATION_LABEL_LINE_HEIGHT.max} step={0.1} value={lineHeightDraft} onChange={(event) => setLineHeightDraft(event.target.value)} onBlur={commitLineHeight} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitLineHeight(); } }} /></label>
    <small>Width {ANNOTATION_LABEL_MAX_WIDTH.min}–{ANNOTATION_LABEL_MAX_WIDTH.max} px · line spacing {ANNOTATION_LABEL_LINE_HEIGHT.min}–{ANNOTATION_LABEL_LINE_HEIGHT.max}×</small>
  </div>;
}
