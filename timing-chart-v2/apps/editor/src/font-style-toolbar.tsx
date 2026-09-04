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
  const strikethrough = decorationParts.includes("line-through");
  const fontFamily = typeof style?.fontFamily === "string" ? style.fontFamily : "";
  const fontSize = typeof style?.fontSize === "number" ? style.fontSize : 12;
  const color = typeof style?.color === "string" ? style.color : "#000000";

  const toggleDecoration = (part: "underline" | "line-through") => {
    const next = decorationParts.includes(part) ? decorationParts.filter((item) => item !== part) : [...decorationParts, part];
    onChange({ ...style, textDecoration: next.join(" ") });
  };
  const clearFormatting = () => onChange({});

  return <div className="font-style-toolbar" role="toolbar" aria-label="Font">
    {/* Bold/Italic/Underline stacked 3 rows tall, icon+label each row -- the
        same packing PowerPoint's Clipboard group uses for Cut/Copy/Format
        Painter, so the toolbar stays narrow instead of spreading out. */}
    <div className="font-style-toggles">
      <button type="button" className="font-style-button" aria-pressed={bold} aria-label="Bold" title="Bold" data-testid={`${idPrefix}-bold`} disabled={disabled} onClick={() => onChange({ ...style, fontWeight: bold ? "normal" : "bold" })}><RibbonIcon name="i-bold" /><span>Bold</span></button>
      <button type="button" className="font-style-button" aria-pressed={italic} aria-label="Italic" title="Italic" data-testid={`${idPrefix}-italic`} disabled={disabled} onClick={() => onChange({ ...style, fontStyle: italic ? "normal" : "italic" })}><RibbonIcon name="i-italic" /><span>Italic</span></button>
      <button type="button" className="font-style-button" aria-pressed={underline} aria-label="Underline" title="Underline" data-testid={`${idPrefix}-underline`} disabled={disabled} onClick={() => toggleDecoration("underline")}><RibbonIcon name="i-underline" /><span>Underline</span></button>
      <button type="button" className="font-style-button" aria-pressed={strikethrough} aria-label="Strikethrough" title="Strikethrough" data-testid={`${idPrefix}-strikethrough`} disabled={disabled} onClick={() => toggleDecoration("line-through")}><RibbonIcon name="i-strikethrough" /><span>Strikethrough</span></button>
    </div>
    <div className="font-style-fields">
      <input className="font-style-family" aria-label="Font family" title="Font family" data-testid={`${idPrefix}-font-family`} value={fontFamily} placeholder="Font" disabled={disabled} onChange={(event) => onChange({ ...style, fontFamily: event.target.value })} />
      <input className="font-style-size" aria-label="Font size" title="Font size" data-testid={`${idPrefix}-font-size`} type="number" min={6} max={48} value={fontSize} disabled={disabled} onChange={(event) => onChange({ ...style, fontSize: Number(event.target.value) })} />
    </div>
    <div className="font-style-toggles">
      <label className="font-style-button font-style-color" title="Text color" data-testid={`${idPrefix}-color-label`}>
        <RibbonIcon name="i-text-color" /><span>Color</span>
        <input type="color" aria-label="Text color" data-testid={`${idPrefix}-color`} value={color} disabled={disabled} onChange={(event) => onChange({ ...style, color: event.target.value })} />
      </label>
      <button type="button" className="font-style-button" aria-label="Clear formatting" title="Clear formatting" data-testid={`${idPrefix}-clear`} disabled={disabled} onClick={clearFormatting}><RibbonIcon name="i-clear-format" /><span>Clear</span></button>
    </div>
  </div>;
}
