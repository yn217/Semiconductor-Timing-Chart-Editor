import { useEffect, useState } from "react";
import { ANNOTATION_PRESENTATION_NUMERIC_RANGES, type JsonObject } from "@timing-chart-v2/schema";

/** #378: Stroke (independent line width/style/opacity) and Fill (independent color/
 * opacity) -- same entity-agnostic style-JsonObject shape and draft/commit
 * discipline as FontStyleToolbar (font-style-toolbar.tsx): Stroke Style and
 * Fill Color are immediate-commit (one click/choice = one completed edit);
 * Stroke Width, Stroke Opacity, and Fill Opacity hold local drafts synced from the
 * committed style and only commit on blur/Enter, so dragging a number
 * spinner or typing a width doesn't turn one edit into many History
 * entries. `disabled`/`reason` come from the shared Annotation Capability
 * Matrix (annotation-capability-matrix.ts) -- when the selected
 * AnnotationType has no independently stylable line/fill, every control
 * here renders disabled with that truthful reason instead of quietly
 * writing a style field the renderer/export ignore. */
export function StrokeFillToolbar({ style, onChange, idPrefix, strokeDisabled, strokeReason, fillDisabled, fillReason, defaults }: {
  readonly style: JsonObject | undefined;
  readonly onChange: (next: JsonObject) => void;
  readonly idPrefix: string;
  readonly defaults: { readonly strokeWidth: number; readonly strokeOpacity: number; readonly fillOpacity: number };
  readonly strokeDisabled?: boolean;
  readonly strokeReason?: string | undefined;
  readonly fillDisabled?: boolean;
  readonly fillReason?: string | undefined;
}) {
  const strokeWidth = typeof style?.strokeWidth === "number" ? style.strokeWidth : defaults.strokeWidth;
  const strokeOpacity = typeof style?.strokeOpacity === "number" ? style.strokeOpacity : defaults.strokeOpacity;
  const strokeStyleValue = style?.strokeStyle === "dashed" || style?.strokeStyle === "dotted" ? style.strokeStyle : "solid";
  const fillColor = typeof style?.fillColor === "string" && style.fillColor !== "none" ? style.fillColor : "#d04a36";
  const fillNone = style?.fillColor === "none";
  const fillOpacity = typeof style?.fillOpacity === "number" ? style.fillOpacity : defaults.fillOpacity;

  const [widthDraft, setWidthDraft] = useState(String(strokeWidth));
  const [strokeOpacityDraft, setStrokeOpacityDraft] = useState(String(strokeOpacity));
  const [opacityDraft, setOpacityDraft] = useState(String(fillOpacity));
  const [widthError, setWidthError] = useState<string>();
  const [strokeOpacityError, setStrokeOpacityError] = useState<string>();
  const [opacityError, setOpacityError] = useState<string>();
  useEffect(() => { setWidthDraft(String(strokeWidth)); setWidthError(undefined); }, [strokeWidth]);
  useEffect(() => { setStrokeOpacityDraft(String(strokeOpacity)); setStrokeOpacityError(undefined); }, [strokeOpacity]);
  useEffect(() => { setOpacityDraft(String(fillOpacity)); setOpacityError(undefined); }, [fillOpacity]);

  const commitWidth = () => {
    const parsed = Number(widthDraft);
    const { min, max } = ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeWidth;
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) { setWidthError(`Stroke width must be between ${min} and ${max} px.`); return; }
    setWidthError(undefined);
    if (parsed !== strokeWidth) onChange({ ...style, strokeWidth: parsed });
  };
  const commitOpacity = () => {
    const parsed = Number(opacityDraft);
    const { min, max } = ANNOTATION_PRESENTATION_NUMERIC_RANGES.fillOpacity;
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) { setOpacityError(`Fill opacity must be between ${min} and ${max}.`); return; }
    setOpacityError(undefined);
    if (parsed !== fillOpacity) onChange({ ...style, fillOpacity: parsed });
  };
  const commitStrokeOpacity = () => {
    const parsed = Number(strokeOpacityDraft);
    const { min, max } = ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeOpacity;
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) { setStrokeOpacityError(`Stroke opacity must be between ${min} and ${max}.`); return; }
    setStrokeOpacityError(undefined);
    if (parsed !== strokeOpacity) onChange({ ...style, strokeOpacity: parsed });
  };
  const onEnterCommits = (commit: () => void) => (event: React.KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); commit(); } };

  return <div className="stroke-fill-toolbar" role="toolbar" aria-label="Stroke and Fill">
    <div className="stroke-fill-group" title={strokeDisabled ? strokeReason : undefined}>
      <span className="stroke-fill-label">Stroke</span>
      <label>Width<input aria-label="Annotation stroke width" aria-invalid={widthError ? "true" : "false"} aria-describedby={widthError ? `${idPrefix}-stroke-width-error` : undefined} type="number" min={ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeWidth.min} max={ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeWidth.max} value={widthDraft} disabled={strokeDisabled} data-testid={`${idPrefix}-stroke-width`} onChange={(event) => { setWidthDraft(event.target.value); setWidthError(undefined); }} onBlur={commitWidth} onKeyDown={onEnterCommits(commitWidth)} /></label>
      {widthError && <small id={`${idPrefix}-stroke-width-error`} role="alert">{widthError}</small>}
      <label>Style<select aria-label="Annotation stroke style" value={strokeStyleValue} disabled={strokeDisabled} data-testid={`${idPrefix}-stroke-style`} onChange={(event) => onChange({ ...style, strokeStyle: event.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
      <label>Opacity<input aria-label="Annotation stroke opacity" aria-invalid={strokeOpacityError ? "true" : "false"} aria-describedby={strokeOpacityError ? `${idPrefix}-stroke-opacity-error` : undefined} type="number" min={ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeOpacity.min} max={ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeOpacity.max} step={0.05} value={strokeOpacityDraft} disabled={strokeDisabled} data-testid={`${idPrefix}-stroke-opacity`} onChange={(event) => { setStrokeOpacityDraft(event.target.value); setStrokeOpacityError(undefined); }} onBlur={commitStrokeOpacity} onKeyDown={onEnterCommits(commitStrokeOpacity)} /></label>
      {strokeOpacityError && <small id={`${idPrefix}-stroke-opacity-error`} role="alert">{strokeOpacityError}</small>}
    </div>
    <div className="stroke-fill-group" title={fillDisabled ? fillReason : undefined}>
      <span className="stroke-fill-label">Fill</span>
      <label className="checkline">None<input aria-label="Annotation fill none" type="checkbox" checked={fillNone} disabled={fillDisabled} data-testid={`${idPrefix}-fill-none`} onChange={(event) => { if (event.target.checked) { onChange({ ...style, fillColor: "none" }); return; } const { fillColor: _fillColor, ...rest } = style ?? {}; onChange(rest); }} /></label>
      <label>Color<input aria-label="Annotation fill color" type="color" value={fillColor} disabled={fillDisabled || fillNone} data-testid={`${idPrefix}-fill-color`} onChange={(event) => onChange({ ...style, fillColor: event.target.value })} /></label>
      <label>Opacity<input aria-label="Annotation fill opacity" aria-invalid={opacityError ? "true" : "false"} aria-describedby={opacityError ? `${idPrefix}-fill-opacity-error` : undefined} type="number" min={ANNOTATION_PRESENTATION_NUMERIC_RANGES.fillOpacity.min} max={ANNOTATION_PRESENTATION_NUMERIC_RANGES.fillOpacity.max} step={0.05} value={opacityDraft} disabled={fillDisabled || fillNone} data-testid={`${idPrefix}-fill-opacity`} onChange={(event) => { setOpacityDraft(event.target.value); setOpacityError(undefined); }} onBlur={commitOpacity} onKeyDown={onEnterCommits(commitOpacity)} /></label>
      {opacityError && <small id={`${idPrefix}-fill-opacity-error`} role="alert">{opacityError}</small>}
    </div>
  </div>;
}
