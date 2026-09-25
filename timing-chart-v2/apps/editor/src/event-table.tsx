import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DragEvent } from "react";
import type { CommandResult } from "@timing-chart-v2/commands";
import type { CanonicalDocument, EnumDefinition, ValueSignal } from "@timing-chart-v2/schema";
import { DOCUMENT_RESOURCE_BUDGET, parseJsonInput } from "@timing-chart-v2/schema";
import type { SignalEditorCommandActions } from "./application/editor-surface-command-controller.js";
import { defaultEventValue, EventRow, QuickValues, ValueEditorControl } from "./event-table-components.js";
import { buildEventTableIndex } from "./runtime/event-table-index.js";
import { reorderTransitionBlock, transitionIdentity } from "./runtime/transition-reorder.js";
import { registerActiveGestureCancel } from "./runtime/active-gesture-cancellation.js";
import { pruneExternalSelection } from "./runtime/external-draft-reconciliation.js";

// Signal transitions have no separately persisted row ID; within the
// canonical value list, the start boundary is the unique row identity.
// Content-based keys can collide for identical adjacent transitions and
// make React reuse the wrong virtualized row/editor state.
const EVENT_ROW_HEIGHT = 30;
const EVENT_OVERSCAN = 8;

// #426: Value Helper's own label/hint were hardcoded to "(Signal)" / the
// binary 0-1-X-Z blurb regardless of the actually-selected Signal's real
// type -- a Bus or State Signal showed the right quick-value buttons
// (QuickValues already resolves those from `signal.type`) underneath a
// caption and hint describing a *different* type. Presentation-only, GUI
// side: doesn't touch the schema-owned `quickValueOptions`/
// `quickValueLiteral` this reads from indirectly via QuickValues.
function valueHelperCopy(signal: ValueSignal): { readonly label: string; readonly hint: string } {
  switch (signal.type) {
    case "bus": return { label: "Bus", hint: `Bus: ${signal.displayFormat ?? "hex"} · width ${signal.width ?? 1}-bit, validated · X / Z supported` };
    case "state": return { label: "State", hint: "State: pick a defined state" };
    case "logic": return { label: "Level", hint: "Level: 0 / 1 / X / Z (High-Z supported)" };
    case "event": return { label: "Event", hint: "Event: NONE, or a named fire" };
    default: return { label: "Signal", hint: "Signal: 0 / 1 / X / Z (High-Z supported)" };
  }
}

export function EventTable({ signal, cycleCount, enumDefinitions, commands, generatorSlot }: { readonly signal: ValueSignal; readonly cycleCount: number; readonly enumDefinitions?: CanonicalDocument["enumDefinitions"]; readonly commands: Pick<SignalEditorCommandActions, "replaceValues" | "updateValue" | "replaceValue" | "removeValue">; readonly generatorSlot?: ReactNode }) {
  const [start, setStart] = useState(0);
  const [value, setValue] = useState(defaultEventValue(signal));
  const [comment, setComment] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() => signal.values[0] === undefined ? undefined : transitionIdentity(signal.values[0]));
  // Bottom Panel Visual Reference pass: bulk row selection (checkbox column)
  // is a separate concept from `selectedStart` (single-row click-highlight,
  // used by the per-row inline Draft/Apply/Cancel and by the toolbar's
  // Duplicate/Delete) -- checking rows only ever feeds the table footer's
  // bulk actions below.
  const [storedCheckedKeys, setCheckedKeys] = useState<ReadonlySet<string>>(new Set());
  const [eventScrollTop, setEventScrollTop] = useState(0);
  const eventViewportRef = useRef<HTMLDivElement>(null);
  const [importStatus, setImportStatus] = useState("Import signal events");
  const fileInput = useRef<HTMLInputElement>(null);
  const indexed = useMemo(() => buildEventTableIndex(signal.values, cycleCount), [signal.values, cycleCount]);
  const enumDefinition: EnumDefinition | undefined = signal.type === "state" && signal.enumId !== undefined ? enumDefinitions?.find((definition) => definition.id === signal.enumId) : undefined;
  const validKeys = useMemo(() => new Set(signal.values.map(transitionIdentity)), [signal.values]);
  const checkedKeys = useMemo(() => pruneExternalSelection(storedCheckedKeys, validKeys), [storedCheckedKeys, validKeys]);
  useEffect(() => {
    setCheckedKeys((current) => pruneExternalSelection(current, validKeys));
  }, [validKeys]);
  const selected = indexed.ordered.find((change) => transitionIdentity(change) === selectedKey);
  const selectTransition = (startValue: number) => {
    const change = indexed.ordered.find((item) => item.start === startValue);
    setSelectedKey(change === undefined ? undefined : transitionIdentity(change));
  };
  const nextStart = indexed.firstFree() ?? Math.max(0, cycleCount - 1);
  const emitValue = (nextValues: readonly ValueSignal["values"][number][]): CommandResult => commands.replaceValues(signal.id, nextValues);
  const addRow = () => commands.updateValue(signal.id, nextStart, value);
  // Row Actions compaction follow-up: the toolbar's Duplicate (targets
  // `selected`) and each row's own Duplicate icon (targets that row
  // directly) are the same operation parametrized over which change point
  // is the source -- one function, not two copies of "find a free cycle
  // and copy value/comment onto it".
  const duplicateChange = (source: ValueSignal["values"][number]) => {
    const duplicateStart = indexed.firstFree();
    if (duplicateStart === undefined) return;
    commands.updateValue(signal.id, duplicateStart, source.value, source.comment);
  };
  const duplicateRow = () => { if (selected) duplicateChange(selected); };
  const canDuplicate = nextStart < cycleCount;
  const exportValues = () => {
    const blob = new Blob([JSON.stringify({ signalId: signal.id, name: signal.name, values: signal.values }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${signal.name || signal.id}-events.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importValues = (file: File) => {
    if (file.size > DOCUMENT_RESOURCE_BUDGET.inputBytes) {
      setImportStatus(`Import rejected: file exceeds ${DOCUMENT_RESOURCE_BUDGET.inputBytes.toLocaleString()} bytes.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsedResult = parseJsonInput(String(reader.result));
        if (!parsedResult.ok) {
          setImportStatus(`Import rejected: ${parsedResult.problems[0]?.message ?? "invalid JSON."}`);
          return;
        }
        const parsed: unknown = parsedResult.value;
        const values = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "values" in parsed ? (parsed as { values: unknown }).values : undefined);
        if (!Array.isArray(values) || values.length === 0 || values.some((item) => !item || typeof item !== "object" || !Number.isInteger((item as { start?: unknown }).start) || !((item as { value?: unknown }).value === undefined || typeof (item as { value?: unknown }).value === "string" || typeof (item as { value?: unknown }).value === "number"))) {
          setImportStatus("Import rejected: expected a non-empty event values array.");
          return;
        }
        const result = emitValue(values as ValueSignal["values"]);
        if (result.ok) setImportStatus(`Imported ${values.length} event${values.length === 1 ? "" : "s"}`);
        else setImportStatus(`Import rejected: ${result.problems[0]?.message ?? "values failed canonical validation."}`);
      } catch {
        setImportStatus("Import rejected: invalid JSON.");
      }
    };
    reader.onerror = () => setImportStatus("Import rejected: file could not be read.");
    reader.readAsText(file);
  };
  // #402: preview-only End/Duration for the Add/Edit Transition form's Draft
  // `start` -- derived the same way each committed row's own `end` is
  // (the start of the next existing change point, or `cycleCount` if none),
  // so the Preview always matches what Apply would actually produce. This
  // is display-only: it is never itself a semantic/geometry source of
  // truth, and Add still dispatches through the one existing
  // `signal.updateValue` command path.
  const previewEnd = indexed.nextEnd(start);
  const addAndContinue = () => {
    commands.updateValue(signal.id, start, value, comment);
    // Auto-advance Start to the next free cycle (excluding the one just
    // committed) so continuous entry doesn't need manual arithmetic each
    // time -- Value is kept (commonly the next transition reuses it),
    // Comment is cleared (a per-transition annotation, not one to repeat).
    const next = indexed.firstFree(start);
    if (next !== undefined) setStart(next);
    setComment("");
  };
  // Bulk footer actions (Bottom Panel Visual Reference pass): additive to
  // the existing per-row Draft/Apply/Cancel + toolbar Duplicate/Delete --
  // checking rows only ever feeds these, never the per-row editing above.
  const checkedCount = checkedKeys.size;
  const toggleChecked = (change: ValueSignal["values"][number]) => setCheckedKeys((current) => { const key = transitionIdentity(change); const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const deleteSelected = () => {
    if (checkedCount === 0 || checkedCount >= signal.values.length) return;
    emitValue(signal.values.filter((change) => !checkedKeys.has(transitionIdentity(change))));
    setCheckedKeys(new Set());
  };
  const moveBy = (delta: -1 | 1) => {
    const ordered = [...indexed.ordered];
    const selectedIndexes = ordered.map((change, index) => checkedKeys.has(transitionIdentity(change)) ? index : -1).filter((index) => index >= 0);
    if (selectedIndexes.length === 0) return;
    const first = selectedIndexes[0]!;
    const last = selectedIndexes[selectedIndexes.length - 1]!;
    if (selectedIndexes.length !== last - first + 1) return;
    const targetIndex = delta < 0 ? first - 1 : last + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length || checkedKeys.has(transitionIdentity(ordered[targetIndex]!))) return;
    const result = reorderTransitionBlock(ordered, checkedKeys, delta < 0 ? first - 1 : last + 1, cycleCount);
    if (!result) return;
    const commandResult = commands.replaceValues(signal.id, result.values);
    if (commandResult.ok) setCheckedKeys(new Set(result.values.slice(result.firstIndex, result.firstIndex + result.blockSize).map(transitionIdentity)));
  };
  const orderedStarts = indexed.ordered;
  const selectedIndexes = orderedStarts.map((change, index) => checkedKeys.has(transitionIdentity(change)) ? index : -1).filter((index) => index >= 0);
  const isContiguous = selectedIndexes.length > 0 && selectedIndexes.length === selectedIndexes.at(-1)! - selectedIndexes[0]! + 1;
  const canMoveUp = isContiguous && selectedIndexes[0]! > 0;
  const canMoveDown = isContiguous && selectedIndexes.at(-1)! < orderedStarts.length - 1;
  const [dragStarts, setDragStarts] = useState<ReadonlySet<string>>();
  const dragStartsRef = useRef<ReadonlySet<string> | undefined>(undefined);
  const setActiveDragStarts = (starts: ReadonlySet<string> | undefined) => { dragStartsRef.current = starts; setDragStarts(starts); };
  useEffect(() => {
    if (dragStarts === undefined) return undefined;
    return registerActiveGestureCancel(() => setActiveDragStarts(undefined));
  }, [dragStarts]);
  const reorderDrop = (targetStart: number) => {
    const activeDragStarts = dragStartsRef.current;
    const target = indexed.ordered.find((change) => change.start === targetStart);
    if (activeDragStarts === undefined || target === undefined || activeDragStarts.has(transitionIdentity(target))) return;
    const ordered = [...indexed.ordered];
    const selectedIndexes = ordered.map((change, index) => activeDragStarts.has(transitionIdentity(change)) ? index : -1).filter((index) => index >= 0);
    const from = selectedIndexes[0] ?? -1;
    const last = selectedIndexes.at(-1) ?? -1;
    const to = ordered.findIndex((change) => change.start === targetStart);
    if (from < 0 || to < 0 || selectedIndexes.length !== last - from + 1) { setActiveDragStarts(undefined); return; }
    const result = reorderTransitionBlock(ordered, activeDragStarts, to, cycleCount);
    if (result) { const commandResult = commands.replaceValues(signal.id, result.values); if (commandResult.ok) setCheckedKeys(new Set(result.values.slice(result.firstIndex, result.firstIndex + result.blockSize).map(transitionIdentity))); }
    setActiveDragStarts(undefined);
  };
  // Visual Quality Closure pass (#402/#426), Section 4: the checkbox column
  // only ever meant "this row feeds the footer's bulk actions below" -- but
  // nothing on screen said so. A header Select All checkbox (tri-state:
  // indeterminate while some-but-not-all rows are checked) plus a visible
  // "N selected" count next to the section title make that relationship
  // explicit without relying on the reader to infer it from the footer
  // alone.
  const allChecked = signal.values.length > 0 && signal.values.every((change) => checkedKeys.has(transitionIdentity(change)));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = checkedCount > 0 && !allChecked; }, [checkedCount, allChecked]);
  const toggleAll = () => setCheckedKeys(allChecked ? new Set() : new Set(signal.values.map(transitionIdentity)));
  const eventFirst = Math.max(0, Math.floor(eventScrollTop / EVENT_ROW_HEIGHT) - EVENT_OVERSCAN);
  const eventLast = Math.min(indexed.ordered.length, Math.ceil((eventScrollTop + (eventViewportRef.current?.clientHeight ?? 300)) / EVENT_ROW_HEIGHT) + EVENT_OVERSCAN);
  const renderedEvents = indexed.ordered.slice(eventFirst, eventLast);
  useEffect(() => {
    if (selectedKey === undefined || !eventViewportRef.current) return;
    const index = indexed.ordered.findIndex((change) => transitionIdentity(change) === selectedKey);
    if (index < 0) return;
    const top = index * EVENT_ROW_HEIGHT;
    const bottom = top + EVENT_ROW_HEIGHT;
    const viewport = eventViewportRef.current;
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
  }, [indexed.ordered, selectedKey]);
  return <div className="event-editor">
    {/* Bottom Panel Visual Reference pass: Add/Edit Transition, Value
        Helper and (for a binary Signal) Generate Waveform render side by
        side in one row, immediately below the tab bar/Group header --
        never behind a Manual/Generator mode switch, and never with the
        Transition editor pushed down by a property form above it (both
        removed from signal-editor.tsx). */}
    <div className="event-panels">
      <form className="transition-form-panel" onSubmit={(event) => {
        event.preventDefault();
        commands.updateValue(signal.id, start, value, comment);
      }}>
        <h2 data-testid="transition-form-mode" data-mode={signal.values.some((change) => change.start === start) ? "edit" : "add"}>{signal.values.some((change) => change.start === start) ? `Editing transition at cycle ${start}` : "Add new transition"}</h2>
        {/* Density fix (#402/#426 follow-up): Start/Value/Comment used to
            stack as three full-height labels; laid out side by side in one
            row instead, since the panel already has ~570px of horizontal
            room at typical viewport widths and this is by far the tallest
            of the three top-row panels today. */}
        {/* Visual Quality Closure pass (#402/#426): the caption text sits in
            its own <span> (`flex-shrink: 0`) so it can never be squeezed
            below its own content width -- the input is the flexible,
            `min-width: 0` side. See signal-generator-editor.tsx for the
            fuller root-cause note; the same bug pattern applied here too. */}
        <div className="transition-form-row">
          <label className="field-inline transition-field-start"><span>Start (cycle)</span><input aria-label="New event start" type="number" min="0" max={cycleCount - 1} step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
          {/* Value Editor Policy pass: this Value field is no longer
              unconditionally free text -- `ValueEditorControl` (shared
              with a Transition row's own inline editor) resolves the
              right control from the Signal's type (a closed logic domain
              gets a real <select>; an open one gets a combo). */}
          <label className="field-inline transition-field-value"><span>Value</span><ValueEditorControl signal={signal} enumDefinition={enumDefinition} value={value} onChange={setValue} ariaLabel="New event value" listId="add-edit-transition-value-options" /></label>
          <label className="field-inline transition-field-comment"><span>Comment</span><input aria-label="New event comment" value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        </div>
        <span className="event-add-preview" data-derived="true" title="Derived from the transitions after this Start; not editable">End: {previewEnd} / Duration: {previewEnd - start} cycles</span>
        <div className="transition-form-actions">
          <button type="submit" data-testid="add-signal-event">Add</button>
          <button type="button" data-testid="add-signal-event-continue" onClick={addAndContinue}>Add &amp; Continue</button>
        </div>
        {/* #426 Visual Quality Closure: "unclear draft state" -- Add/Add &
            Continue each commit one `signal.updateValue` command immediately
            (own History/Undo step), there is no separate pending batch to
            lose track of. This table intentionally uses an immediate-commit
            model rather than a page-level Draft/Apply pair (unlike
            Bookmark/Annotation's Cancel+Apply); make that explicit instead
            of leaving the model to be inferred from behavior alone. */}
        <span className="transition-form-hint">Applies immediately -- each Add is its own Undo step.</span>
      </form>
      <div className="value-helper-panel">
        <h2>Value Helper <span>({valueHelperCopy(signal).label})</span></h2>
        <QuickValues signal={signal} setValue={setValue} />
        <span className="value-helper-hint">{valueHelperCopy(signal).hint}</span>
      </div>
      {generatorSlot}
    </div>
    {/* Visual Quality Closure pass, Section 5: an explicit "Transitions (N)"
        section identity so this table doesn't read as an anonymous list
        sitting below an unlabeled Duplicate/Add Row/Delete toolbar -- the
        three roles (Add/Edit Transition, Value Helper + Generate Waveform
        above, Transitions here) are each named now. */}
    <div className="event-table-heading">
      <h2>Transitions <span>({signal.values.length})</span></h2>
    </div>
    <div className="event-toolbar" role="toolbar" aria-label="Signal event commands" data-testid="signal-event-toolbar">
      <span className="event-selected-status" data-testid="event-selected-status" role="status">{selected ? `Selected: transition at cycle ${selected.start}` : "No transition selected"}</span><button type="button" onClick={duplicateRow} disabled={!selected || !canDuplicate} data-testid="event-duplicate">Duplicate</button>
      <button type="button" onClick={addRow} data-testid="event-add-row">Add Row</button>
      <button type="button" className="danger" onClick={() => selected && commands.removeValue(signal.id, selected.start)} disabled={!selected || signal.values.length === 1} data-testid="event-delete-row">Delete</button>
    </div>
    <div ref={eventViewportRef} className="event-table-scroll" onScroll={(event) => setEventScrollTop(event.currentTarget.scrollTop)}>
      <div className="event-table" role="table" aria-label="Signal events">
        {/* Visual Quality Closure pass, Section 4: Select All is a real
            tri-state checkbox (checked/indeterminate/unchecked) driving the
            exact same `checkedStarts` set each row's own checkbox feeds --
            not a decorative header cell. */}
        <div className="event-row event-columns" role="row"><input ref={selectAllRef} type="checkbox" aria-label="Select all transitions" checked={allChecked} onChange={toggleAll} /><span>#</span><span>Start</span><span className="event-derived-column" data-derived="true" title="Derived: End is the next transition's Start (or the last cycle). Edit Start to change it.">End</span><span className="event-derived-column" data-derived="true" title="Derived: End minus Start. Not directly editable.">Duration</span><span>Value</span><span>Comment</span><span>Actions</span></div>
        <div aria-hidden="true" style={{ height: eventFirst * EVENT_ROW_HEIGHT }} />
        {renderedEvents.map((change, offset) => { const index = eventFirst + offset; const key = transitionIdentity(change); return <EventRow key={key} index={index + 1} signal={signal} enumDefinition={enumDefinition} change={change} end={indexed.ordered[index + 1]?.start ?? cycleCount} selected={key === selectedKey} checked={checkedKeys.has(key)} canDuplicate={canDuplicate} onToggleChecked={() => toggleChecked(change)} onSelect={selectTransition} onDuplicate={() => duplicateChange(change)} commands={commands} draggable onDragStart={() => setActiveDragStarts(new Set(checkedKeys.has(key) && checkedCount > 1 ? checkedKeys : [key]))} onDragOver={(event: DragEvent<HTMLFormElement>) => { event.preventDefault(); }} onDrop={(event: DragEvent<HTMLFormElement>) => { event.preventDefault(); reorderDrop(change.start); }} onDragEnd={() => setActiveDragStarts(undefined)} />; })}
        <div aria-hidden="true" style={{ height: Math.max(0, indexed.ordered.length - eventLast) * EVENT_ROW_HEIGHT }} />
      </div>
    </div>
    <div className="event-table-footer">
      <div className="event-table-footer-bulk">
        <button type="button" className="danger" data-testid="event-delete-selected" disabled={checkedCount === 0 || checkedCount >= signal.values.length} onClick={deleteSelected}>Delete Selected</button>
        <button type="button" data-testid="event-move-up" disabled={!canMoveUp} onClick={() => moveBy(-1)}>Move Up</button>
        <button type="button" data-testid="event-move-down" disabled={!canMoveDown} onClick={() => moveBy(1)}>Move Down</button>
        <span data-testid="event-selected-count">{checkedCount} row{checkedCount === 1 ? "" : "s"} selected</span>
      </div>
      <div className="event-table-footer-io">
        <button type="button" onClick={() => fileInput.current?.click()} data-testid="event-import-action">Import...</button>
        <button type="button" onClick={exportValues} data-testid="event-export-action">Export...</button>
        <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import signal events" onChange={(event) => { const file = event.target.files?.[0]; if (file) importValues(file); event.currentTarget.value = ""; }} />
        <output data-testid="event-import-status">{importStatus}</output>
      </div>
    </div>
  </div>;
}
