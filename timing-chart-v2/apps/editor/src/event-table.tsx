import { useRef, useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { ValueSignal } from "@timing-chart-v2/schema";
import { defaultEventValue, EventRow, QuickValues } from "./event-table-components.js";
import { nextCommandId } from "./command-id.js";
import { RibbonIcon } from "./ribbon-icon.js";

export function EventTable({ signal, cycleCount, onCommand }: { readonly signal: ValueSignal; readonly cycleCount: number; readonly onCommand: (command: SemanticCommand) => CommandResult }) {
  const [start, setStart] = useState(0);
  const [value, setValue] = useState(defaultEventValue(signal));
  const [selectedStart, setSelectedStart] = useState<number | undefined>(signal.values[0]?.start);
  const [presetsOpen, setPresetsOpen] = useState(false);
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
  return <div className="event-editor">
    <div className="event-heading"><h2>Event Table</h2><span>End and duration are derived</span></div>
    <div className="event-toolbar" role="toolbar" aria-label="Signal event commands" data-testid="signal-event-toolbar">
      <button type="button" className="bottom-action" onClick={() => setPresetsOpen((current) => !current)} aria-pressed={presetsOpen} data-testid="event-presets"><RibbonIcon name="i-settings" /><span>Presets</span></button>
      <button type="button" className="bottom-action" onClick={duplicateRow} disabled={!selected || nextStart >= cycleCount} data-testid="event-duplicate"><RibbonIcon name="i-duplicate" /><span>Duplicate</span></button>
      <button type="button" className="bottom-action" onClick={() => fileInput.current?.click()} data-testid="event-import-action"><RibbonIcon name="i-import" /><span>Import...</span></button>
      <button type="button" className="bottom-action" onClick={exportValues} data-testid="event-export-action"><RibbonIcon name="i-export" /><span>Export...</span></button>
      <button type="button" onClick={addRow} data-testid="event-add-row">Add Row</button>
      <button type="button" onClick={() => selected && onCommand({ id: nextCommandId("remove_value"), type: "signal.removeValue", signalId: signal.id, start: selected.start })} disabled={!selected || signal.values.length === 1} data-testid="event-delete-row">Delete</button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import signal events" onChange={(event) => { const file = event.target.files?.[0]; if (file) importValues(file); event.currentTarget.value = ""; }} />
      {presetsOpen && <div className="event-presets" role="group" aria-label="Event value presets"><QuickValues signal={signal} setValue={setValue} /></div>}
      <output data-testid="event-import-status">{importStatus}</output>
    </div>
    <div className="event-table" role="table" aria-label="Signal events">
      <div className="event-row event-columns" role="row"><span>Start</span><span>Value</span><span>End</span><span>Duration</span><span>Comment</span><span>Actions</span></div>
      {signal.values.map((change, index) => <EventRow key={change.start} signal={signal} change={change} end={signal.values[index + 1]?.start ?? cycleCount} selected={change.start === selectedStart} onSelect={setSelectedStart} onCommand={onCommand} nextCommandId={nextCommandId} />)}
    </div>
    <form className="event-add" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("add_value"), type: "signal.updateValue", signalId: signal.id, start, value });
    }}>
      <label>Start<input aria-label="New event start" type="number" min="0" max={cycleCount - 1} step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
      <label>Value<input aria-label="New event value" value={value} onChange={(event) => setValue(event.target.value)} /></label>
      <QuickValues signal={signal} setValue={setValue} />
      <button type="submit" data-testid="add-signal-event">Add / replace event</button>
    </form>
  </div>;
}
