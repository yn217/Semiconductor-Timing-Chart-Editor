import { useEffect, useState } from "react";
import type { CommentRow, JsonObject } from "@timing-chart-v2/schema";
import type { SignalEditorCommandActions } from "./application/editor-surface-command-controller.js";
import { FontStyleToolbar } from "./font-style-toolbar.js";
import { DraftStatus } from "./draft-status.js";

const committedLineHeightOf = (row: CommentRow): number => typeof row.display.style?.lineHeight === "number" ? row.display.style.lineHeight : 1.4;

// Numeric drafts stay as text so an empty or malformed field is visible as a
// draft problem instead of silently becoming 0 (Number("") === 0).
const parseDraftNumber = (text: string): number | undefined => {
  if (text.trim() === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
};

export function CommentRowEditor({ signal, commands, onCancel }: {
  readonly signal: CommentRow;
  readonly commands: Pick<SignalEditorCommandActions, "updateCommentRow">;
  readonly onCancel: () => void;
}) {
  const [title, setTitle] = useState(signal.title);
  const [body, setBody] = useState(signal.body);
  const [spacingBeforeText, setSpacingBeforeText] = useState(String(signal.spacingBefore ?? 0));
  const [spacingAfterText, setSpacingAfterText] = useState(String(signal.spacingAfter ?? 0));
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
  const [lineHeightText, setLineHeightText] = useState(String(committedLineHeightOf(signal)));
  useEffect(() => {
    setTitle(signal.title);
    setBody(signal.body);
    setSpacingBeforeText(String(signal.spacingBefore ?? 0));
    setSpacingAfterText(String(signal.spacingAfter ?? 0));
    setStyleDraft({ ...(signal.display.style ?? {}) });
    setLineHeightText(String(committedLineHeightOf(signal)));
  }, [signal]);
  const committedLineHeight = committedLineHeightOf(signal);
  const committedStyle = { ...(signal.display.style ?? {}) };
  const lineHeight = parseDraftNumber(lineHeightText);
  const spacingBefore = parseDraftNumber(spacingBeforeText);
  const spacingAfter = parseDraftNumber(spacingAfterText);
  const draftProblem = lineHeight === undefined || lineHeight < 1 || lineHeight > 3 ? "Line spacing must be a number from 1 to 3."
    : spacingBefore === undefined || spacingBefore < 0 ? "Spacing before must be a number of 0 or more."
    : spacingAfter === undefined || spacingAfter < 0 ? "Spacing after must be a number of 0 or more."
    : "";
  const nextStyle = { ...styleDraft, lineHeight: lineHeight ?? committedLineHeight };
  const hasChanges = title !== signal.title || body !== signal.body || spacingBefore !== (signal.spacingBefore ?? 0) || spacingAfter !== (signal.spacingAfter ?? 0) || JSON.stringify(nextStyle) !== JSON.stringify({ ...committedStyle, lineHeight: committedLineHeight });
  const apply = () => {
    if (!hasChanges || draftProblem !== "" || spacingBefore === undefined || spacingAfter === undefined) return;
    commands.updateCommentRow(signal.id, { title, body, spacingBefore, spacingAfter, displayStyle: nextStyle });
  };
  return <form className="comment-row-editor" aria-label="Comment Row Editor" data-testid="comment-row-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }} onSubmit={(event) => { event.preventDefault(); apply(); }}>
    <h2>Comment Row</h2>
    <div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div>
    <FontStyleToolbar idPrefix="comment-row-font" style={styleDraft} onChange={(next: JsonObject) => setStyleDraft(next)} />
    <label>Line spacing<input aria-label="Comment Row line spacing" aria-invalid={draftProblem !== "" && (lineHeight === undefined || lineHeight < 1 || lineHeight > 3) ? true : undefined} data-testid="comment-row-line-height" type="number" min="1" max="3" step="0.1" value={lineHeightText} onChange={(event) => setLineHeightText(event.target.value)} /></label>
    <label>Title<input aria-label="Comment Row title" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Body<textarea aria-label="Comment Row body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} /></label>
    <label>Spacing Before<input aria-label="Comment Row spacing before" aria-invalid={spacingBefore === undefined || spacingBefore < 0 ? true : undefined} type="number" min="0" step="1" value={spacingBeforeText} onChange={(event) => setSpacingBeforeText(event.target.value)} /></label>
    <label>Spacing After<input aria-label="Comment Row spacing after" aria-invalid={spacingAfter === undefined || spacingAfter < 0 ? true : undefined} type="number" min="0" step="1" value={spacingAfterText} onChange={(event) => setSpacingAfterText(event.target.value)} /></label>
    {draftProblem && <div className="editor-problem" role="alert" data-testid="comment-row-draft-problem">{draftProblem}</div>}
    <div className="bottom-sticky-actions">
      {hasChanges && <DraftStatus testId="comment-row-unapplied" />}
      <span className="bottom-sticky-buttons">
        <button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button>
        <button type="submit" data-testid="apply-comment-row" disabled={!hasChanges || draftProblem !== ""}>Apply Comment Row</button>
      </span>
    </div>
  </form>;
}
