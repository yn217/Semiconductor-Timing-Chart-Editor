import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { ValueSignal } from "@timing-chart-v2/schema";
import { defaultEventValue, EventRow, QuickValues } from "./event-table-components.js";
import { nextCommandId } from "./command-id.js";

export function EventTable({ signal, cycleCount, onCommand, generatorSlot }: { readonly signal: ValueSignal; readonly cycleCount: number; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly generatorSlot?: ReactNode }) {
  const [start, setStart] = useState(0);
  const [value, setValue] = useState(defaultEventValue(signal));
  const [comment, setComment] = useState("");
  const [selectedStart, setSelectedStart] = useState<number | undefined>(signal.values[0]?.start);
  // Bottom Panel Visual Reference pass: bulk row selection (checkbox column)
  // is a separate concept from `selectedStart` (single-row click-highlight,
  // used by the per-row inline Draft/Apply/Cancel and by the toolbar's
  // Duplicate/Delete) -- checking rows only ever feeds the table footer's
  // bulk actions below.
  const [checkedStarts, setCheckedStarts] = useState<ReadonlySet<number>>(new Set());
  const [importStatus, setImportStatus] = useState("Import signal events");
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = signal.values.find((change) => change.start === selectedStart);
  const nextStart = Array.from({ length: cycleCount }, (_, cycle) => cycle).find((cycle) => !signal.values.some((item) => item.start === cycle)) ?? Math.max(0, cycleCount - 1);
  const emitValue = (nextValues: readonly ValueSignal["values"][number][]): CommandResult => onCommand({ id: nextCommandId("replace_values"), type: "signal.replaceValues", signalId: signal.id, values: nextValues });
  const addRow = () => onCommand({ id: nextCommandId("add_value"), type: "signal.updateValue", signalId: signal.id, start: nextStart, value });
  const duplicateRow = () => {
    if (!selected) return;
    const duplicateStart = Array.from({ length: cycleCount }, (_, cycle) => cycle).find((cycle) => !signal.values.some((item) => item.start === cycle));
    if (duplicateStart === undefined) return;
    onCommand({ id: nextCommandId("duplicate_value"), type: "signal.updateValue", signalId: signal.id, start: duplicateStart, value: selected.value, ...(selected.comment === undefined ? {} : { comment: selected.comment }) });
  };
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
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
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
  const previewEnd = signal.values.filter((change) => change.start > start).map((change) => change.start).sort((a, b) => a - b)[0] ?? cycleCount;
  const addAndContinue = () => {
    onCommand({ id: nextCommandId("add_value"), type: "signal.updateValue", signalId: signal.id, start, value, ...(comment ? { comment } : {}) });
    // Auto-advance Start to the next free cycle (excluding the one just
    // committed) so continuous entry doesn't need manual arithmetic each
    // time -- Value is kept (commonly the next transition reuses it),
    // Comment is cleared (a per-transition annotation, not one to repeat).
    const taken = new Set([...signal.values.map((change) => change.start), start]);
    const next = Array.from({ length: cycleCount }, (_, cycle) => cycle).find((cycle) => !taken.has(cycle));
    if (next !== undefined) setStart(next);
    setComment("");
  };
  // Bulk footer actions (Bottom Panel Visual Reference pass): additive to
  // the existing per-row Draft/Apply/Cancel + toolbar Duplicate/Delete --
  // checking rows only ever feeds these, never the per-row editing above.
  const checkedCount = checkedStarts.size;
  const toggleChecked = (rowStart: number) => setCheckedStarts((current) => { const next = new Set(current); if (next.has(rowStart)) next.delete(rowStart); else next.add(rowStart); return next; });
  const deleteSelected = () => {
    if (checkedCount === 0 || checkedCount >= signal.values.length) return;
    emitValue(signal.values.filter((change) => !checkedStarts.has(change.start)));
    setCheckedStarts(new Set());
  };
  const soleCheckedStart = checkedCount === 1 ? [...checkedStarts][0] : undefined;
  const soleChecked = soleCheckedStart === undefined ? undefined : signal.values.find((change) => change.start === soleCheckedStart);
  const moveBy = (delta: -1 | 1) => {
    if (!soleChecked) return;
    const target = soleChecked.start + delta;
    if (target < 0 || target >= cycleCount || signal.values.some((change) => change.start === target)) return;
    onCommand({ id: nextCommandId("move_value"), type: "signal.replaceValue", signalId: signal.id, fromStart: soleChecked.start, start: target, value: String(soleChecked.value), ...(soleChecked.comment === undefined ? {} : { comment: soleChecked.comment }) });
    setCheckedStarts(new Set([target]));
  };
  const canMoveUp = soleChecked !== undefined && soleChecked.start > 0 && !signal.values.some((change) => change.start === soleChecked.start - 1);
  const canMoveDown = soleChecked !== undefined && soleChecked.start < cycleCount - 1 && !signal.values.some((change) => change.start === soleChecked.start + 1);
  // Visual Quality Closure pass (#402/#426), Section 4: the checkbox column
  // only ever meant "this row feeds the footer's bulk actions below" -- but
  // nothing on screen said so. A header Select All checkbox (tri-state:
  // indeterminate while some-but-not-all rows are checked) plus a visible
  // "N selected" count next to the section title make that relationship
  // explicit without relying on the reader to infer it from the footer
  // alone.
  const allChecked = signal.values.length > 0 && checkedCount === signal.values.length;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = checkedCount > 0 && !allChecked; }, [checkedCount, allChecked]);
  const toggleAll = () => setCheckedStarts(allChecked ? new Set() : new Set(signal.values.map((change) => change.start)));
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
        onCommand({ id: nextCommandId("add_value"), type: "signal.updateValue", signalId: signal.id, start, value, ...(comment ? { comment } : {}) });
      }}>
        <h2>Add / Edit Transition</h2>
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
          <label className="field-inline transition-field-value"><span>Value</span><input aria-label="New event value" value={value} onChange={(event) => setValue(event.target.value)} /></label>
          <label className="field-inline transition-field-comment"><span>Comment</span><input aria-label="New event comment" value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        </div>
        <span className="event-add-preview">End: {previewEnd} / Duration: {previewEnd - start} cycles</span>
        <div className="transition-form-actions">
          <button type="submit" data-testid="add-signal-event">Add</button>
          <button type="button" data-testid="add-signal-event-continue" onClick={addAndContinue}>Add &amp; Continue</button>
        </div>
      </form>
      <div className="value-helper-panel">
        <h2>Value Helper <span>(Signal)</span></h2>
        <QuickValues signal={signal} setValue={setValue} />
        <span className="value-helper-hint">Signal: 0 / 1 / X / Z (High-Z supported)</span>
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
      <button type="button" onClick={duplicateRow} disabled={!selected || nextStart >= cycleCount} data-testid="event-duplicate">Duplicate</button>
      <button type="button" onClick={addRow} data-testid="event-add-row">Add Row</button>
      <button type="button" className="danger" onClick={() => selected && onCommand({ id: nextCommandId("remove_value"), type: "signal.removeValue", signalId: signal.id, start: selected.start })} disabled={!selected || signal.values.length === 1} data-testid="event-delete-row">Delete</button>
    </div>
    <div className="event-table-scroll">
      <div className="event-table" role="table" aria-label="Signal events">
        {/* Visual Quality Closure pass, Section 4: Select All is a real
            tri-state checkbox (checked/indeterminate/unchecked) driving the
            exact same `checkedStarts` set each row's own checkbox feeds --
            not a decorative header cell. */}
        <div className="event-row event-columns" role="row"><input ref={selectAllRef} type="checkbox" aria-label="Select all transitions" checked={allChecked} onChange={toggleAll} /><span>#</span><span>Start</span><span>End</span><span>Duration</span><span>Value</span><span>Comment</span><span>Actions</span></div>
        {signal.values.map((change, index) => <EventRow key={change.start} index={index + 1} signal={signal} change={change} end={signal.values[index + 1]?.start ?? cycleCount} selected={change.start === selectedStart} checked={checkedStarts.has(change.start)} onToggleChecked={() => toggleChecked(change.start)} onSelect={setSelectedStart} onCommand={onCommand} nextCommandId={nextCommandId} />)}
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
