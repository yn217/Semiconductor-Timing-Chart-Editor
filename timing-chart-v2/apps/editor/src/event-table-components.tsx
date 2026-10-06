import { quickValueLiteral, quickValueOptions, type EnumDefinition, type SignalValueChange, type ValueSignal } from "@timing-chart-v2/schema";
import { formatBusValueAtCycle, formatSignalValueChange } from "./signal-value-presentation.js";
import type { SignalEditorCommandActions } from "./application/editor-surface-command-controller.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { canonicalValueFromEditor, resolveValueEditorPolicy } from "./runtime/value-editor-policy.js";
import { eventRowFields, nextEventRowDraft, sameEventRowFields, type EventRowDraft, type EventRowFields } from "./runtime/event-row-drafts.js";

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

export function EventRow({ signal, enumDefinition, change, end, index, selected, checked, draft, canDuplicate, onToggleChecked, onSelect, onDraftChange, onDuplicate, commands, draggable, onDragStart, onDragOver, onDrop, onDragEnd }: {
  readonly signal: ValueSignal;
  readonly enumDefinition?: EnumDefinition | undefined;
  readonly change: ValueSignal["values"][number];
  readonly end: number;
  // Bottom Panel Visual Reference pass: `#` display index (1-based, table
  // position) -- purely presentational, never a stable identity (the
  // change point's own `start` cycle remains the one true identity).
  readonly index: number;
  readonly selected: boolean;
  // The row's unapplied Draft, owned by event-table.tsx so it survives
  // recycled virtual slots and scrolling; undefined for a clean row.
  readonly draft: EventRowDraft | undefined;
  // Bulk-selection checkbox state, separate from `selected` (the single-
  // row click-highlight already driving this row's own inline Draft) --
  // feeds only the table footer's bulk actions in event-table.tsx.
  readonly checked: boolean;
  readonly canDuplicate: boolean;
  readonly onToggleChecked: () => void;
  readonly onSelect: (start: number) => void;
  readonly onDraftChange: (draft: EventRowDraft | undefined) => void;
  readonly onDuplicate: () => void;
  readonly commands: Pick<SignalEditorCommandActions, "replaceValue" | "removeValue">;
  readonly draggable?: boolean;
  readonly onDragStart?: () => void;
  readonly onDragOver?: (event: React.DragEvent<HTMLFormElement>) => void;
  readonly onDrop?: (event: React.DragEvent<HTMLFormElement>) => void;
  readonly onDragEnd?: () => void;
}) {
  // Rows are always editable: Start/Value/Comment are inputs at rest, and a
  // row with an unapplied Draft shows its own Cancel/Apply. Apply needs a
  // Draft that differs from the committed `change`, so a no-op submit cannot
  // manufacture an empty History entry. `end` is derived and read-only, so it
  // is excluded from the Draft.
  const committed = eventRowFields(change);
  const { start, value, comment } = draft?.fields ?? committed;
  const externalConflict = draft?.conflict ?? false;
  const hasChanges = draft !== undefined && !sameEventRowFields(draft.fields, committed);
  const formatted = formatEventRowValue(signal, change);
  const edit = (fields: Partial<EventRowFields>) => {
    const next = { start, value, comment, ...fields };
    onDraftChange(nextEventRowDraft(draft, committed, next));
  };
  const reloadLatest = () => onDraftChange(undefined);
  const keepDraft = () => { if (draft) onDraftChange({ ...draft, base: committed, conflict: false }); };
  return <form className={`event-row${selected ? " selected" : ""}${hasChanges ? " editing" : ""}`} role="row" data-event-id={change.id ?? `start-${change.start}`} data-event-start={change.start} draggable={false} onDragEnter={onDragOver} onDragOver={onDragOver} onDropCapture={onDrop} onDrop={onDrop} onDragEnd={onDragEnd} onClick={() => onSelect(change.start)} onSubmit={(event) => {
    event.preventDefault();
    if (!hasChanges || externalConflict) return;
    const result = commands.replaceValue(signal.id, change.start, start, canonicalValueFromEditor(signal, enumDefinition, value), comment);
    // A rejected Draft (e.g. a duplicate change point) stays in the row so
    // the Problems banner's guidance can be acted on directly.
    if (result.ok) onDraftChange(undefined);
  }}>
    {/* Visual Quality Closure pass (#402/#426): "Select transition N" (not
        the bare cycle number) so the accessible name reads as a sentence,
        matching Section 4's explicit example. */}
    <input type="checkbox" aria-label={`Select transition ${index}`} checked={checked} onClick={(event) => event.stopPropagation()} onChange={onToggleChecked} />
    <span className="event-row-drag-handle" role="img" aria-label={`Drag transition ${index}`} title="Drag to reorder" draggable={draggable} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("text/plain", String(change.start)); event.dataTransfer.effectAllowed = "move"; onDragStart?.(); }} onDragEnd={onDragEnd}>⋮⋮</span>
    <span className="event-row-index">{index}</span>
    {/* Start/Comment keep the stable `data-testid` their former read-only
        cells had, so a row stays addressable by its committed start cycle. */}
    <input aria-label={`Start ${change.start}`} data-testid={`event-row-start-${change.start}`} type="number" min="0" step="1" value={start} onChange={(event) => edit({ start: Number(event.target.value) })} />
    <output data-testid={`event-row-end-${change.start}`}>{end}</output><output data-testid={`event-row-duration-${change.start}`}>{end - change.start}</output>
    {/* The input edits the canonical literal; when the Signal's display
        format (bus radix, display label) renders it differently, the
        formatted value stays visible beside it. */}
    <span className="event-row-value-cell"><ValueEditorControl signal={signal} enumDefinition={enumDefinition} value={value} onChange={(next) => edit({ value: next })} ariaLabel={`Value ${change.start}`} listId={`event-row-value-options-${change.start}`} />{formatted !== String(change.value) && <output data-testid={`event-row-value-${change.start}`} title="Displayed value">{formatted}</output>}</span>
    <input aria-label={`Comment ${change.start}`} data-testid={`event-row-comment-${change.start}`} value={comment} onChange={(event) => edit({ comment: event.target.value })} />
    {/* A clean row shows compact Duplicate/Delete icons; a row with an
        unapplied Draft swaps them for Cancel/Apply (the wider state) plus a
        titled dirty dot, so the Actions column never has to fit both. */}
    <span className="event-actions">
      {hasChanges && externalConflict && <span role="alert" data-testid={`event-row-draft-conflict-${change.start}`}>Transition changed elsewhere. Reload latest or keep this draft before saving.</span>}
      {hasChanges && externalConflict && <><button type="button" onClick={(event) => { event.stopPropagation(); reloadLatest(); }}>Reload latest</button><button type="button" onClick={(event) => { event.stopPropagation(); keepDraft(); }}>Keep my draft</button></>}
      {hasChanges && <span className="event-row-dirty-dot" role="status" title="Unapplied changes" aria-label="Unapplied changes" data-testid={`event-row-unapplied-${change.start}`} />}
      {hasChanges
        ? <>
          <button type="button" onClick={(event) => { event.stopPropagation(); reloadLatest(); }} data-testid={`event-row-cancel-${change.start}`}>Cancel</button>
          <button type="submit" disabled={externalConflict} data-testid={`event-row-apply-${change.start}`}>Apply</button>
        </>
        : <>
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
