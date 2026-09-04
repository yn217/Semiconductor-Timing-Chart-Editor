import { useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CommentRow, JsonObject } from "@timing-chart-v2/schema";
import type { EventCommandIdFactory } from "./event-table-components.js";
import { FontStyleToolbar } from "./font-style-toolbar.js";

export function CommentRowEditor({ signal, onCommand, onCancel, nextCommandId }: {
  readonly signal: CommentRow;
  readonly onCommand: (command: SemanticCommand) => void;
  readonly onCancel: () => void;
  readonly nextCommandId: EventCommandIdFactory;
}) {
  const [title, setTitle] = useState(signal.title);
  const [body, setBody] = useState(signal.body);
  const [spacingBefore, setSpacingBefore] = useState(signal.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal.spacingAfter ?? 0);
  return <form className="comment-row-editor" aria-label="Comment Row Editor" data-testid="comment-row-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }} onSubmit={(event) => {
    event.preventDefault();
    onCommand({ id: nextCommandId("comment_row_update"), type: "commentRow.update", signalId: signal.id, title, body, spacingBefore, spacingAfter });
  }}>
    <h2>Comment Row</h2>
    <div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div>
    <FontStyleToolbar idPrefix="comment-row-font" style={signal.display.style} onChange={(next: JsonObject) => onCommand({ id: nextCommandId("comment_row_font"), type: "commentRow.update", signalId: signal.id, title: signal.title, body: signal.body, displayStyle: next })} />
    <label>Line spacing<input aria-label="Comment Row line spacing" data-testid="comment-row-line-height" type="number" min="1" max="3" step="0.1" value={typeof signal.display.style?.lineHeight === "number" ? signal.display.style.lineHeight : 1.4} onChange={(event) => onCommand({ id: nextCommandId("comment_row_line_height"), type: "commentRow.update", signalId: signal.id, title: signal.title, body: signal.body, displayStyle: { ...signal.display.style, lineHeight: Number(event.target.value) } })} /></label>
    <label>Title<input aria-label="Comment Row title" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Body<textarea aria-label="Comment Row body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} /></label>
    <label>Spacing Before<input aria-label="Comment Row spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
    <label>Spacing After<input aria-label="Comment Row spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
    <button type="submit" data-testid="apply-comment-row">Apply Comment Row</button><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button>
  </form>;
}
