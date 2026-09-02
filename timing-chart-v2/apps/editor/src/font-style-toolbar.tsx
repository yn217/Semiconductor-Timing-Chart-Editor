import type { JsonObject } from "@timing-chart-v2/schema";
import { RibbonIcon } from "./ribbon-icon.js";

/** PowerPoint-style Font group: Bold/Italic/Underline toggles + font family
 * and size. Entity-agnostic -- reads/writes the same style JsonObject shape
 * the renderer's shared parseTextStyle/applyTextStyle already validates
 * (packages/renderer/src/stable-surface.ts), whether the caller's `style`
 * comes from a Signal/CommentRow's display.style or an Annotation's style.
 * Every change is applied immediately (no separate Apply step), matching
 * how Bold/Italic/Underline behave in a real word processor ribbon. */
export function FontStyleToolbar({ style, onChange, idPrefix, disabled }: {
  readonly style: JsonObject | undefined;
  readonly onChange: (next: JsonObject) => void;
  readonly idPrefix: string;
  readonly disabled?: boolean;
}) {
  const bold = style?.fontWeight === "bold";
  const italic = style?.fontStyle === "italic";
  const decorationParts = typeof style?.textDecoration === "string" ? style.textDecoration.split(" ").filter(Boolean) : [];
  const underline = decorationParts.includes("underline");
  const fontFamily = typeof style?.fontFamily === "string" ? style.fontFamily : "";
  const fontSize = typeof style?.fontSize === "number" ? style.fontSize : 12;

  const toggleUnderline = () => {
    const next = underline ? decorationParts.filter((part) => part !== "underline") : [...decorationParts, "underline"];
    onChange({ ...style, textDecoration: next.join(" ") });
  };

  return <div className="font-style-toolbar" role="toolbar" aria-label="Font">
    <button type="button" className="font-style-button" aria-pressed={bold} aria-label="Bold" data-testid={`${idPrefix}-bold`} disabled={disabled} onClick={() => onChange({ ...style, fontWeight: bold ? "normal" : "bold" })}><RibbonIcon name="i-bold" /></button>
    <button type="button" className="font-style-button" aria-pressed={italic} aria-label="Italic" data-testid={`${idPrefix}-italic`} disabled={disabled} onClick={() => onChange({ ...style, fontStyle: italic ? "normal" : "italic" })}><RibbonIcon name="i-italic" /></button>
    <button type="button" className="font-style-button" aria-pressed={underline} aria-label="Underline" data-testid={`${idPrefix}-underline`} disabled={disabled} onClick={toggleUnderline}><RibbonIcon name="i-underline" /></button>
    <input className="font-style-family" aria-label="Font family" data-testid={`${idPrefix}-font-family`} value={fontFamily} placeholder="Font" disabled={disabled} onChange={(event) => onChange({ ...style, fontFamily: event.target.value })} />
    <input className="font-style-size" aria-label="Font size" data-testid={`${idPrefix}-font-size`} type="number" min={6} max={48} value={fontSize} disabled={disabled} onChange={(event) => onChange({ ...style, fontSize: Number(event.target.value) })} />
  </div>;
}
