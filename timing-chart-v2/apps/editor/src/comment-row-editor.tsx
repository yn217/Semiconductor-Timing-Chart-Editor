import { useEffect, useState } from "react";
import type { CommentRow, JsonObject } from "@timing-chart-v2/schema";
import type { SignalEditorCommandActions } from "./application/editor-surface-command-controller.js";
import { FontStyleToolbar } from "./font-style-toolbar.js";
import { DraftStatus } from "./draft-status.js";

export function CommentRowEditor({ signal, commands, onCancel }: {
  readonly signal: CommentRow;
  readonly commands: Pick<SignalEditorCommandActions, "updateCommentRow">;
  readonly onCancel: () => void;
}) {
  const [title, setTitle] = useState(signal.title);
  const [body, setBody] = useState(signal.body);
  const [spacingBefore, setSpacingBefore] = useState(signal.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal.spacingAfter ?? 0);
  const [styleDraft, setStyleDraft] = useState<JsonObject>(() => ({ ...(signal.display.style ?? {}) }));
  // #426/#431 item 3 ("Apply/Cancel乱立の整理" -- "同じ entity 内で即時反映と
  // Draftが無秩序に混在しない"): Line spacing used to call
  // `commands.updateCommentRow` directly from its own onChange -- a fresh
  // Semantic Command dispatch on every keystroke of a number input, unlike
  // every other field on this same entity (Title/Body/Spacing), which
  // already held local draft state and committed only through this form's
  // one Apply. Brought into the same draft/Apply gate as those fields;
  // Bold/Italic/Underline/Strikethrough/Family/Size/Color stay immediate
  // via FontStyleToolbar's own documented one-click-one-edit policy
  // (font-style-toolbar.tsx), which is a deliberate, consistently-applied
  // exception used the same way by Signal/Annotation, not a second
  // inconsistent commit path invented here.
  const [lineHeight, setLineHeight] = useState(typeof signal.display.style?.lineHeight === "number" ? signal.display.style.lineHeight : 1.4);
  useEffect(() => {
    setTitle(signal.title);
    setBody(signal.body);
    setSpacingBefore(signal.spacingBefore ?? 0);
    setSpacingAfter(signal.spacingAfter ?? 0);
    setStyleDraft({ ...(signal.display.style ?? {}) });
    setLineHeight(typeof signal.display.style?.lineHeight === "number" ? signal.display.style.lineHeight : 1.4);
  }, [signal]);
  const committedLineHeight = typeof signal.display.style?.lineHeight === "number" ? signal.display.style.lineHeight : 1.4;
  const committedStyle = { ...(signal.display.style ?? {}) };
  const nextStyle = { ...styleDraft, lineHeight };
  const hasChanges = title !== signal.title || body !== signal.body || spacingBefore !== (signal.spacingBefore ?? 0) || spacingAfter !== (signal.spacingAfter ?? 0) || JSON.stringify(nextStyle) !== JSON.stringify({ ...committedStyle, lineHeight: committedLineHeight });
  const apply = () => {
    if (!hasChanges) return;
    commands.updateCommentRow(signal.id, { title, body, spacingBefore, spacingAfter, displayStyle: nextStyle });
  };
  return <form className="comment-row-editor" aria-label="Comment Row Editor" data-testid="comment-row-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }} onSubmit={(event) => { event.preventDefault(); apply(); }}>
    <h2>Comment Row</h2>
    <div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div>
    <FontStyleToolbar idPrefix="comment-row-font" style={styleDraft} onChange={(next: JsonObject) => setStyleDraft(next)} />
    <label>Line spacing<input aria-label="Comment Row line spacing" data-testid="comment-row-line-height" type="number" min="1" max="3" step="0.1" value={lineHeight} onChange={(event) => setLineHeight(Number(event.target.value))} /></label>
    <label>Title<input aria-label="Comment Row title" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Body<textarea aria-label="Comment Row body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} /></label>
    <label>Spacing Before<input aria-label="Comment Row spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
    <label>Spacing After<input aria-label="Comment Row spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
    <div className="bottom-sticky-actions">
      {hasChanges && <DraftStatus testId="comment-row-unapplied" />}
      <span className="bottom-sticky-buttons">
        <button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button>
        <button type="submit" data-testid="apply-comment-row" disabled={!hasChanges}>Apply Comment Row</button>
      </span>
    </div>
  </form>;
}
