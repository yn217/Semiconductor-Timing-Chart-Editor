import { useEffect, useRef, useState } from "react";
import { quickValueLiteral, quickValueOptions, type EnumDefinition, type SignalValueChange, type ValueSignal } from "@timing-chart-v2/schema";
import { formatBusValueAtCycle, formatSignalValueChange } from "./signal-value-presentation.js";
import type { SignalEditorCommandActions } from "./application/editor-surface-command-controller.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { canonicalValueFromEditor, resolveValueEditorPolicy } from "./runtime/value-editor-policy.js";
import { reconcileExternalDraft } from "./runtime/external-draft-reconciliation.js";

// Value Editor Policy pass: the ONE control used everywhere a Signal's
// `values` entries are edited -- Add/Edit Transition (event-table.tsx)
// and a Transition row's own inline editor (below) both render this,
// never their own separately-invented Value input. `resolveValueEditorPolicy`
// (runtime/value-editor-policy.ts) is the one place Signal type resolves to
// a control kind; this component only renders whatever it returns.
export function ValueEditorControl({ signal, enumDefinition, value, onChange, ariaLabel, listId }: {
  readonly signal: ValueSignal;
  readonly enumDefinition?: EnumDefinition | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
  // A closed-domain <select> needs no id; an open-domain combo's
  // <datalist> does, and it must be unique per rendered field (multiple
  // rows/forms render this component at once).
  readonly listId: string;
}) {
  const policy = resolveValueEditorPolicy(signal, enumDefinition);
  if (policy.kind === "select") {
    return <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      {policy.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
  }
  // A combo is a plain text <input> (still `fill()`-able, still accepts
  // any value -- an open domain can't be constrained to a fixed <select>
  // without risking silently rejecting a legitimate existing or new
  // value) paired with a <datalist> of one-click suggestions.
  return <>
    <input aria-label={ariaLabel} list={listId} value={value} placeholder={policy.placeholder} onChange={(event) => onChange(event.target.value)} />
    <datalist id={listId}>{policy.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist>
  </>;
}

export function EventRow({ signal, enumDefinition, change, end, index, selected, checked, editing, canDuplicate, onToggleChecked, onSelect, onEditingChange, onDuplicate, commands, draggable, onDragStart, onDragOver, onDrop, onDragEnd }: {
  readonly signal: ValueSignal;
  readonly enumDefinition?: EnumDefinition | undefined;
  readonly change: ValueSignal["values"][number];
  readonly end: number;
  // Bottom Panel Visual Reference pass: `#` display index (1-based, table
  // position) -- purely presentational, never a stable identity (the
  // change point's own `start` cycle remains the one true identity).
  readonly index: number;
  readonly selected: boolean;
  readonly editing: boolean;
  // Bulk-selection checkbox state, separate from `selected` (the single-
  // row click-highlight already driving this row's own inline Draft) --
  // feeds only the table footer's bulk actions in event-table.tsx.
  readonly checked: boolean;
  readonly canDuplicate: boolean;
  readonly onToggleChecked: () => void;
  readonly onSelect: (start: number) => void;
  readonly onEditingChange: (editing: boolean) => void;
  readonly onDuplicate: () => void;
  readonly commands: Pick<SignalEditorCommandActions, "replaceValue" | "removeValue">;
  readonly draggable?: boolean;
  readonly onDragStart?: () => void;
  readonly onDragOver?: (event: React.DragEvent<HTMLFormElement>) => void;
  readonly onDrop?: (event: React.DragEvent<HTMLFormElement>) => void;
  readonly onDragEnd?: () => void;
}) {
  const [start, setStart] = useState(change.start);
  const [value, setValue] = useState(String(change.value));
  const [comment, setComment] = useState(change.comment ?? "");
  const [externalConflict, setExternalConflict] = useState(false);
  const baseRef = useRef({ start: change.start, value: String(change.value), comment: change.comment ?? "" });
  // Visual Quality Closure follow-up (#402/#426), Section 7: a row reads
  // as plain text at rest -- inline inputs only exist while editing is active.
  // This is presentation-only; the Draft/Apply contract underneath is
  // unchanged (`hasChanges`/`cancel` still gate Save and restore the last-
  // committed values exactly as before, they just also now drive whether
  // the row is showing them at all).
  // #402: Draft->Apply -- Save must stay disabled while this row's Draft is
  // byte-for-byte identical to its committed `change`, so a no-op submit
  // can't manufacture an empty History entry, and a Cancel action must be
  // able to discard the Draft back to the last-committed values (rather
  // than only being resettable by re-selecting the row, which would also
  // disturb the selection/Preview surface). `end` is derived and read-only,
  // so it is intentionally excluded from both the Draft and this comparison.
  const hasChanges = start !== change.start || value !== String(change.value) || comment !== (change.comment ?? "");
  useEffect(() => {
    const latest = { start: change.start, value: String(change.value), comment: change.comment ?? "" };
    const resolution = reconcileExternalDraft(baseRef.current, { start, value, comment }, latest, editing, (left, right) => left.start === right.start && left.value === right.value && left.comment === right.comment);
    if (resolution.kind === "rebase") {
      setStart(resolution.value.start); setValue(resolution.value.value); setComment(resolution.value.comment);
      baseRef.current = resolution.value;
      setExternalConflict(false);
    } else if (resolution.kind === "conflict") setExternalConflict(true);
  }, [change.start, change.value, change.comment, start, value, comment, editing]);
  const reloadLatest = () => {
    const latest = { start: change.start, value: String(change.value), comment: change.comment ?? "" };
    setStart(latest.start); setValue(latest.value); setComment(latest.comment);
    baseRef.current = latest;
    setExternalConflict(false);
  };
  const keepDraft = () => {
    baseRef.current = { start: change.start, value: String(change.value), comment: change.comment ?? "" };
    setExternalConflict(false);
  };
  const cancel = () => { reloadLatest(); };
  const startEditing = () => { onSelect(change.start); onEditingChange(true); };
  const stopEditing = () => { cancel(); onEditingChange(false); };
  return <form className={`event-row${selected ? " selected" : ""}${editing ? " editing" : ""}`} role="row" data-event-id={change.id ?? `start-${change.start}`} data-event-start={change.start} draggable={false} onDragEnter={onDragOver} onDragOver={onDragOver} onDropCapture={onDrop} onDrop={onDrop} onDragEnd={onDragEnd} onClick={() => onSelect(change.start)} onSubmit={(event) => {
    event.preventDefault();
    if (!hasChanges || externalConflict) return;
    const result = commands.replaceValue(signal.id, change.start, start, canonicalValueFromEditor(signal, enumDefinition, value), comment);
    // Only leave edit mode on a command the planner actually accepted --
    // a rejected Draft (e.g. a duplicate change point) stays open and
    // editable so the Problems banner's guidance can be acted on directly,
    // instead of silently reverting to read-only with the edit lost.
    if (result.ok) {
      baseRef.current = { start, value, comment };
      setExternalConflict(false);
      onEditingChange(false);
    }
  }}>
    {/* Visual Quality Closure pass (#402/#426): "Select transition N" (not
        the bare cycle number) so the accessible name reads as a sentence,
        matching Section 4's explicit example. */}
    <input type="checkbox" aria-label={`Select transition ${index}`} checked={checked} onClick={(event) => event.stopPropagation()} onChange={onToggleChecked} />
    <span className="event-row-drag-handle" role="img" aria-label={`Drag transition ${index}`} title="Drag to reorder" draggable={draggable} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("text/plain", String(change.start)); event.dataTransfer.effectAllowed = "move"; onDragStart?.(); }} onDragEnd={onDragEnd}>⋮⋮</span>
    <span className="event-row-index">{index}</span>
    {/* Every read-only cell keeps a stable `data-testid` (in addition to
        the editing control's own aria-label, unchanged) so a row's
        contents stay addressable in either state without relying on
        positional `.nth()` matching -- read-only rows add up to 3 more
        <output> elements than before (Start/Value/Comment), which would
        otherwise shift any existing "the 2nd <output>" style locator. */}
    {editing
      ? <input aria-label={`Start ${change.start}`} type="number" min="0" step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} />
      : <output data-testid={`event-row-start-${change.start}`}>{change.start}</output>}
    <output data-testid={`event-row-end-${change.start}`}>{end}</output><output data-testid={`event-row-duration-${change.start}`}>{end - change.start}</output>
    {editing
      ? <ValueEditorControl signal={signal} enumDefinition={enumDefinition} value={value} onChange={setValue} ariaLabel={`Value ${change.start}`} listId={`event-row-value-options-${change.start}`} />
      : <output data-testid={`event-row-value-${change.start}`}>{formatEventRowValue(signal, change)}</output>}
    {editing
      ? <input aria-label={`Comment ${change.start}`} value={comment} onChange={(event) => setComment(event.target.value)} />
      : <output className="event-row-comment" data-testid={`event-row-comment-${change.start}`}>{change.comment ?? ""}</output>}
    {/* Visual Quality Closure pass: Cancel/Save/Remove sitting side by side
        on every row *at all times* is exactly the fixed-width Actions
        column that clipped ("Remov..." cut off) -- three always-on text
        buttons plus the full-text "● Unapplied changes" indicator never fit
        in a column narrow enough to leave the Comment column real width.
        Fix is compaction, not a font shrink or overflow:hidden clip: a
        row at rest shows one compact, titled/aria-labelled icon per action
        (Edit/Duplicate/Delete); only the row actually being edited shows
        Cancel/Save (the wider state). The dirty flag itself is a
        title/aria-labelled dot instead of a full sentence -- still
        announced to assistive tech and still visually present, just not
        ~110px of running text competing for the same narrow column. */}
    <span className="event-actions">
      {editing && externalConflict && <span role="alert" data-testid={`event-row-draft-conflict-${change.start}`}>Transition changed elsewhere. Reload latest or keep this draft before saving.</span>}
      {editing && externalConflict && <><button type="button" onClick={(event) => { event.stopPropagation(); reloadLatest(); }}>Reload latest</button><button type="button" onClick={(event) => { event.stopPropagation(); keepDraft(); }}>Keep my draft</button></>}
      {editing && hasChanges && <span className="event-row-dirty-dot" role="status" title="Unapplied changes" aria-label="Unapplied changes" data-testid={`event-row-unapplied-${change.start}`} />}
      {editing
        ? <>
          <button type="button" onClick={(event) => { event.stopPropagation(); stopEditing(); }} data-testid={`event-row-cancel-${change.start}`}>Cancel</button>
          <button type="submit" disabled={!hasChanges || externalConflict}>Save</button>
        </>
        : <>
          <button type="button" className="icon-button" title="Edit transition" aria-label={`Edit transition at cycle ${change.start}`} onClick={(event) => { event.stopPropagation(); startEditing(); }}><RibbonIcon name="i-edit" /></button>
          <button type="button" className="icon-button" title="Duplicate transition" aria-label={`Duplicate transition at cycle ${change.start}`} disabled={!canDuplicate} onClick={(event) => { event.stopPropagation(); onDuplicate(); }}><RibbonIcon name="i-duplicate" /></button>
          <button type="button" className="icon-button danger" title="Delete transition" aria-label={`Delete transition at cycle ${change.start}`} disabled={signal.values.length === 1} onClick={(event) => { event.stopPropagation(); commands.removeValue(signal.id, change.start); }}><RibbonIcon name="i-delete" /></button>
        </>}
    </span>
  </form>;
}

/** Match the value shown by the waveform projection while preserving an
 * explicit presentation label when one is supplied. */
export function formatEventRowValue(signal: Pick<ValueSignal, "type" | "displayFormat" | "width">, change: Pick<SignalValueChange, "value" | "displayLabel">): string {
  return formatSignalValueChange(signal, change);
}

export function InspectorBusCurrentValue({ signal, cycle }: { readonly signal: ValueSignal; readonly cycle: number }) {
  const value = formatBusValueAtCycle(signal, cycle);
  return <div className="property-row"><span>Value at cycle {cycle}</span><output aria-label={`Bus value at cycle ${cycle}`} data-testid="inspector-bus-current-value">{value ?? "—"}</output></div>;
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
