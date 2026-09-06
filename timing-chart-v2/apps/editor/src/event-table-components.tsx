import { useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { quickValueLiteral, quickValueOptions, type CommandId, type ValueSignal } from "@timing-chart-v2/schema";
import { RibbonIcon } from "./ribbon-icon.js";

export type EventCommandIdFactory = (scope: string) => CommandId;

export function EventRow({ signal, change, end, index, selected, checked, onToggleChecked, onSelect, onCommand, nextCommandId }: {
  readonly signal: ValueSignal;
  readonly change: ValueSignal["values"][number];
  readonly end: number;
  // Bottom Panel Visual Reference pass: `#` display index (1-based, table
  // position) -- purely presentational, never a stable identity (the
  // change point's own `start` cycle remains the one true identity).
  readonly index: number;
  readonly selected: boolean;
  // Bulk-selection checkbox state, separate from `selected` (the single-
  // row click-highlight already driving this row's own inline Draft) --
  // feeds only the table footer's bulk actions in event-table.tsx.
  readonly checked: boolean;
  readonly onToggleChecked: () => void;
  readonly onSelect: (start: number) => void;
  readonly onCommand: (command: SemanticCommand) => void;
  readonly nextCommandId: EventCommandIdFactory;
}) {
  const [start, setStart] = useState(change.start);
  const [value, setValue] = useState(String(change.value));
  const [comment, setComment] = useState(change.comment ?? "");
  // #402: Draft->Apply -- Save must stay disabled while this row's Draft is
  // byte-for-byte identical to its committed `change`, so a no-op submit
  // can't manufacture an empty History entry, and a Cancel action must be
  // able to discard the Draft back to the last-committed values (rather
  // than only being resettable by re-selecting the row, which would also
  // disturb the selection/Preview surface). `end` is derived and read-only,
  // so it is intentionally excluded from both the Draft and this comparison.
  const hasChanges = start !== change.start || value !== String(change.value) || comment !== (change.comment ?? "");
  const cancel = () => { setStart(change.start); setValue(String(change.value)); setComment(change.comment ?? ""); };
  return <form className={`event-row${selected ? " selected" : ""}`} role="row" data-event-start={change.start} onClick={() => onSelect(change.start)} onSubmit={(event) => {
    event.preventDefault();
    if (!hasChanges) return;
    onCommand({ id: nextCommandId("replace_value"), type: "signal.replaceValue", signalId: signal.id, fromStart: change.start, start, value, ...(comment ? { comment } : {}) });
  }}>
    {/* Visual Quality Closure pass (#402/#426): "Select transition N" (not
        the bare cycle number) so the accessible name reads as a sentence,
        matching Section 4's explicit example. */}
    <input type="checkbox" aria-label={`Select transition ${index}`} checked={checked} onClick={(event) => event.stopPropagation()} onChange={onToggleChecked} />
    <span className="event-row-index">{index}</span>
    <input aria-label={`Start ${change.start}`} type="number" min="0" step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} />
    <output>{end}</output><output>{end - change.start}</output>
    <input aria-label={`Value ${change.start}`} value={value} onChange={(event) => setValue(event.target.value)} />
    <input aria-label={`Comment ${change.start}`} value={comment} onChange={(event) => setComment(event.target.value)} />
    {/* Visual Quality Closure pass: Cancel/Save/Remove sitting side by side
        on every row *at all times* is exactly the fixed-150px Actions
        column that clipped ("Remov..." cut off) -- three always-on text
        buttons plus the full-text "● Unapplied changes" indicator never fit
        in a column narrow enough to leave the Comment column real width.
        Fix is compaction, not a font shrink or overflow:hidden clip: the
        row's own Draft state (`hasChanges`) already distinguishes "being
        edited" from "at rest", so only the row actually being edited shows
        Cancel/Save (the wider state); an at-rest row shows one compact,
        labelled icon button (Remove). The dirty flag itself becomes a
        title/aria-labelled dot instead of a full sentence -- still
        announced to assistive tech and still visually present, just not
        ~110px of running text competing for the same narrow column. */}
    <span className="event-actions">
      {hasChanges && <span className="event-row-dirty-dot" role="status" title="Unapplied changes" aria-label="Unapplied changes" data-testid={`event-row-unapplied-${change.start}`} />}
      {hasChanges
        ? <>
          <button type="button" onClick={(event) => { event.stopPropagation(); cancel(); }} data-testid={`event-row-cancel-${change.start}`}>Cancel</button>
          <button type="submit">Save</button>
        </>
        : <button type="button" className="icon-button danger" title="Delete transition" aria-label={`Delete transition at cycle ${change.start}`} onClick={(event) => { event.stopPropagation(); onCommand({ id: nextCommandId("remove_value"), type: "signal.removeValue", signalId: signal.id, start: change.start }); }}><RibbonIcon name="i-delete" /></button>}
    </span>
  </form>;
}

export function QuickValues({ signal, setValue }: { readonly signal: ValueSignal; readonly setValue: (value: string) => void }) {
  const values = quickValueOptions(signal.type);
  return <div className="quick-values" role="group" aria-label="Quick values">{values.map((item) => <button type="button" key={item} onClick={() => setValue(quickValueLiteral(signal.type, item))}>{item}</button>)}</div>;
}

export function defaultEventValue(signal: ValueSignal): string {
  if (signal.type === "bus") return signal.displayFormat === "binary" ? "00000000" : "00";
  if (signal.type === "state") return "IDLE";
  if (signal.type === "event") return "NONE";
  return "0";
}
