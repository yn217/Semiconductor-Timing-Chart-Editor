import { useEffect, useState } from "react";
import type { JsonObject } from "@timing-chart-v2/schema";

/** #378: Stroke (independent line width/style) and Fill (independent color/
 * opacity) -- same entity-agnostic style-JsonObject shape and draft/commit
 * discipline as FontStyleToolbar (font-style-toolbar.tsx): Stroke Style and
 * Fill Color are immediate-commit (one click/choice = one completed edit);
 * Stroke Width and Fill Opacity hold a local draft synced from the
 * committed style and only commit on blur/Enter, so dragging a number
 * spinner or typing a width doesn't turn one edit into many History
 * entries. `disabled`/`reason` come from the shared Annotation Capability
 * Matrix (annotation-capability-matrix.ts) -- when the selected
 * AnnotationType has no independently stylable line/fill, every control
 * here renders disabled with that truthful reason instead of quietly
 * writing a style field the renderer/export ignore. */
export function StrokeFillToolbar({ style, onChange, idPrefix, strokeDisabled, strokeReason, fillDisabled, fillReason }: {
  readonly style: JsonObject | undefined;
  readonly onChange: (next: JsonObject) => void;
  readonly idPrefix: string;
  readonly strokeDisabled?: boolean;
  readonly strokeReason?: string | undefined;
  readonly fillDisabled?: boolean;
  readonly fillReason?: string | undefined;
}) {
  const strokeWidth = typeof style?.strokeWidth === "number" ? style.strokeWidth : 2;
  const strokeStyleValue = style?.strokeStyle === "dashed" || style?.strokeStyle === "dotted" ? style.strokeStyle : "solid";
  const fillColor = typeof style?.fillColor === "string" && style.fillColor !== "none" ? style.fillColor : "#d04a36";
  const fillNone = style?.fillColor === "none";
  const fillOpacity = typeof style?.fillOpacity === "number" ? style.fillOpacity : 0.12;

  const [widthDraft, setWidthDraft] = useState(String(strokeWidth));
  const [opacityDraft, setOpacityDraft] = useState(String(fillOpacity));
  useEffect(() => setWidthDraft(String(strokeWidth)), [strokeWidth]);
  useEffect(() => setOpacityDraft(String(fillOpacity)), [fillOpacity]);

  const commitWidth = () => {
    const parsed = Number(widthDraft);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 8) { setWidthDraft(String(strokeWidth)); return; }
    if (parsed !== strokeWidth) onChange({ ...style, strokeWidth: parsed });
  };
  const commitOpacity = () => {
    const parsed = Number(opacityDraft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) { setOpacityDraft(String(fillOpacity)); return; }
    if (parsed !== fillOpacity) onChange({ ...style, fillOpacity: parsed });
  };
  const onEnterCommits = (commit: () => void) => (event: React.KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); commit(); } };

  return <div className="stroke-fill-toolbar" role="toolbar" aria-label="Stroke and Fill">
    <div className="stroke-fill-group" title={strokeDisabled ? strokeReason : undefined}>
      <span className="stroke-fill-label">Stroke</span>
      <label>Width<input aria-label="Annotation stroke width" type="number" min={1} max={8} value={widthDraft} disabled={strokeDisabled} data-testid={`${idPrefix}-stroke-width`} onChange={(event) => setWidthDraft(event.target.value)} onBlur={commitWidth} onKeyDown={onEnterCommits(commitWidth)} /></label>
      <label>Style<select aria-label="Annotation stroke style" value={strokeStyleValue} disabled={strokeDisabled} data-testid={`${idPrefix}-stroke-style`} onChange={(event) => onChange({ ...style, strokeStyle: event.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
    </div>
    <div className="stroke-fill-group" title={fillDisabled ? fillReason : undefined}>
      <span className="stroke-fill-label">Fill</span>
      <label className="checkline">None<input aria-label="Annotation fill none" type="checkbox" checked={fillNone} disabled={fillDisabled} data-testid={`${idPrefix}-fill-none`} onChange={(event) => { if (event.target.checked) { onChange({ ...style, fillColor: "none" }); return; } const { fillColor: _fillColor, ...rest } = style ?? {}; onChange(rest); }} /></label>
      <label>Color<input aria-label="Annotation fill color" type="color" value={fillColor} disabled={fillDisabled || fillNone} data-testid={`${idPrefix}-fill-color`} onChange={(event) => onChange({ ...style, fillColor: event.target.value })} /></label>
      <label>Opacity<input aria-label="Annotation fill opacity" type="number" min={0} max={1} step={0.05} value={opacityDraft} disabled={fillDisabled || fillNone} data-testid={`${idPrefix}-fill-opacity`} onChange={(event) => setOpacityDraft(event.target.value)} onBlur={commitOpacity} onKeyDown={onEnterCommits(commitOpacity)} /></label>
    </div>
  </div>;
}
