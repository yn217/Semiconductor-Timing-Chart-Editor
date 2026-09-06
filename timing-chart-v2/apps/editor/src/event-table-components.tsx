import { useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { quickValueLiteral, quickValueOptions, type CommandId, type ValueSignal } from "@timing-chart-v2/schema";

export type EventCommandIdFactory = (scope: string) => CommandId;

export function EventRow({ signal, change, end, selected, onSelect, onCommand, nextCommandId }: {
  readonly signal: ValueSignal;
  readonly change: ValueSignal["values"][number];
  readonly end: number;
  readonly selected: boolean;
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
    <input aria-label={`Start ${change.start}`} type="number" min="0" step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} />
    <output>{end}</output><output>{end - change.start}</output>
    <input aria-label={`Value ${change.start}`} value={value} onChange={(event) => setValue(event.target.value)} />
    <input aria-label={`Comment ${change.start}`} value={comment} onChange={(event) => setComment(event.target.value)} />
    <span className="event-actions">
      {hasChanges && <output data-testid={`event-row-unapplied-${change.start}`}>● Unapplied changes</output>}
      <button type="button" onClick={(event) => { event.stopPropagation(); cancel(); }} disabled={!hasChanges} data-testid={`event-row-cancel-${change.start}`}>Cancel</button>
      <button type="submit" disabled={!hasChanges}>Save</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onCommand({ id: nextCommandId("remove_value"), type: "signal.removeValue", signalId: signal.id, start: change.start }); }}>Remove</button>
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
