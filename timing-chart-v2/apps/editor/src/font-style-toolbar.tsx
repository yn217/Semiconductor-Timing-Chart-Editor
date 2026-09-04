import { useEffect, useState } from "react";
import type { JsonObject } from "@timing-chart-v2/schema";
import { RibbonIcon } from "./ribbon-icon.js";

/** PowerPoint-style Font group: Bold/Italic/Underline toggles + font family
 * and size. Entity-agnostic -- reads/writes the same style JsonObject shape
 * the renderer's shared parseTextStyle/applyTextStyle already validates
 * (packages/renderer/src/stable-surface.ts), whether the caller's `style`
 * comes from a Signal/CommentRow's display.style or an Annotation's style.
 *
 * Bold/Italic/Underline/Strikethrough apply immediately (no separate Apply
 * step), matching how those behave in a real word processor ribbon -- each
 * click is exactly one completed edit. Font Family / Size / Color are
 * different: `onChange` here is a direct commit (one call = one
 * SemanticCommand = one History entry, see #331), so committing on every
 * keystroke while typing a family name, or every intermediate value while
 * dragging a size spinner or a color picker, would turn ONE user edit into
 * many Undo steps. Those three fields hold their own local draft state
 * (kept in sync with the committed `style` prop whenever selection changes
 * underneath them) and only call `onChange` once the edit is actually
 * finished -- Enter or blur for text/number, blur for color (closing the
 * picker returns focus, so blur reliably fires once per completed choice).
 * A draft that didn't actually change is never committed, so tabbing
 * through without editing produces no History entry either. */
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

  const [familyDraft, setFamilyDraft] = useState(fontFamily);
  const [sizeDraft, setSizeDraft] = useState(String(fontSize));
  const [colorDraft, setColorDraft] = useState(color);
  // Resync every draft when the committed style changes for a reason other
  // than this toolbar's own commit (a different Annotation/Signal/Comment
  // Row got selected, or Undo/Redo moved the value) -- otherwise switching
  // selection while a stale draft is sitting in one of these fields would
  // let a later blur commit the WRONG entity's leftover text onto the newly
  // selected one.
  useEffect(() => setFamilyDraft(fontFamily), [fontFamily]);
  useEffect(() => setSizeDraft(String(fontSize)), [fontSize]);
  useEffect(() => setColorDraft(color), [color]);

  const commitFamily = () => { if (familyDraft !== fontFamily) onChange({ ...style, fontFamily: familyDraft }); };
  const commitSize = () => {
    const parsed = Number(sizeDraft);
    if (!Number.isFinite(parsed)) { setSizeDraft(String(fontSize)); return; }
    if (parsed !== fontSize) onChange({ ...style, fontSize: parsed });
  };
  const commitColor = () => { if (colorDraft !== color) onChange({ ...style, color: colorDraft }); };
  const onEnterCommits = (commit: () => void) => (event: React.KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); commit(); } };

  const toggleDecoration = (part: "underline" | "line-through") => {
    const next = decorationParts.includes(part) ? decorationParts.filter((item) => item !== part) : [...decorationParts, part];
    onChange({ ...style, textDecoration: next.join(" ") });
  };
  // Remove only the fields THIS toolbar owns (Bold/Italic/Underline/
  // Strikethrough/Family/Size/Color) -- `onChange({})` unconditionally
  // wiped the whole style object, which for a Comment Row also erases
  // `lineHeight` (a layout choice, not a font-formatting one, and not
  // exposed by this toolbar at all). Style keys this toolbar never wrote
  // pass through untouched. Clicking Clear on an already-clear entity now
  // produces the exact same style object it started with, so the
  // planner's no-op check (packages/commands/src/planner.ts's
  // "annotation.updateProperties" case) makes it a genuine Canonical/
  // History/Dirty no-op instead of an empty-but-different style value.
  const hasFontFormatting = style !== undefined && (style.fontWeight !== undefined || style.fontStyle !== undefined || style.fontFamily !== undefined || style.fontSize !== undefined || style.color !== undefined || style.textDecoration !== undefined);
  const clearFormatting = () => {
    if (!style) return; // nothing set at all -- already clear, dispatch nothing.
    const { fontWeight: _fontWeight, fontStyle: _fontStyle, fontFamily: _fontFamily, fontSize: _fontSize, color: _color, textDecoration: _textDecoration, ...rest } = style;
    onChange(rest);
  };

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
      <input className="font-style-family" aria-label="Font family" title="Font family" data-testid={`${idPrefix}-font-family`} value={familyDraft} placeholder="Font" disabled={disabled} onChange={(event) => setFamilyDraft(event.target.value)} onBlur={commitFamily} onKeyDown={onEnterCommits(commitFamily)} />
      <input className="font-style-size" aria-label="Font size" title="Font size" data-testid={`${idPrefix}-font-size`} type="number" min={6} max={48} value={sizeDraft} disabled={disabled} onChange={(event) => setSizeDraft(event.target.value)} onBlur={commitSize} onKeyDown={onEnterCommits(commitSize)} />
    </div>
    <div className="font-style-toggles">
      <label className={`font-style-button font-style-color${disabled ? " font-style-color-disabled" : ""}`} title="Text color" data-testid={`${idPrefix}-color-label`}>
        <RibbonIcon name="i-text-color" /><span>Color</span>
        <input type="color" aria-label="Text color" data-testid={`${idPrefix}-color`} value={colorDraft} disabled={disabled} onChange={(event) => setColorDraft(event.target.value)} onBlur={commitColor} />
      </label>
      <button type="button" className="font-style-button" aria-label="Clear formatting" title={hasFontFormatting ? "Clear formatting" : "No font formatting to clear"} data-testid={`${idPrefix}-clear`} disabled={disabled || !hasFontFormatting} onClick={clearFormatting}><RibbonIcon name="i-clear-format" /><span>Clear</span></button>
    </div>
  </div>;
}
