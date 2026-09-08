import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { Signal, SignalId, Transaction } from "@timing-chart-v2/schema";

type UnlinkButton = (label: string, onClick: () => void) => ReactNode;

// #454: toggling a link commits a canonical revision immediately, which
// remounts the whole Inspector (it's keyed on revision, same as every other
// Inspector editor). Plain component state for "is the picker open" would
// reset to closed on every single toggle, forcing a re-click of "Add
// signal..." between each one when linking several signals in a row --
// module-scoped persistence (the same pattern `useInspectorAccordion`
// already uses for section open/closed state) keeps it open across that
// remount instead.
let linkedSignalPickerOpen = false;

export function TransactionLinkedSignals({ transaction, document, onToggle, renderUnlinkButton }: { readonly transaction: Transaction; readonly document: Readonly<CanonicalDocument>; readonly onToggle: (signalId: SignalId) => void; readonly renderUnlinkButton: UnlinkButton }) {
  const [pickerOpenState, setPickerOpenState] = useState(linkedSignalPickerOpen);
  const setPickerOpen = (updater: boolean | ((current: boolean) => boolean)) => setPickerOpenState((current) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    linkedSignalPickerOpen = next;
    return next;
  });
  const pickerOpen = pickerOpenState;
  const [query, setQuery] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("");
  const linkedIds = new Set(transaction.linkedSignals ?? []);
  const searchableSignals = useMemo(() => document.signals
    .filter((signal) => signal.type !== "commentRow")
    .map((signal) => ({ signal, normalizedSearchText: [...signal.source.instancePath, signal.source.signalName, signal.display.name].join(" ").toLocaleLowerCase() })), [document]);
  const signals = searchableSignals.map((item) => item.signal);
  const linked = signals.filter((signal) => linkedIds.has(signal.id));
  const normalizedLinkedFilter = linkedFilter.trim().toLocaleLowerCase();
  const linkedVisible = searchableSignals.filter((item) => linkedIds.has(item.signal.id) && (!normalizedLinkedFilter || item.normalizedSearchText.includes(normalizedLinkedFilter))).slice(0, 50).map((item) => item.signal);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = searchableSignals.filter((item) => !normalizedQuery || item.normalizedSearchText.includes(normalizedQuery)).slice(0, 50).map((item) => item.signal);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => { setActiveIndex((index) => results.length === 0 ? 0 : Math.min(index, results.length - 1)); }, [results.length, normalizedQuery]);
  const toggle = (signal: Signal) => onToggle(signal.id);
  const handleResultsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex((index) => event.key === "Home" ? 0 : event.key === "End" ? results.length - 1 : event.key === "ArrowDown" ? Math.min(index + 1, results.length - 1) : Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(results[activeIndex]!);
    }
  };
  return <div className="transaction-linked-signals" data-testid="transaction-linked-signals"><h3>Linked Signals ({linked.length})</h3><label>Filter linked<input aria-label="Filter linked signals" value={linkedFilter} onChange={(event) => setLinkedFilter(event.target.value)} /></label><div className="transaction-linked-list" data-testid="linked-signal-list">{linkedVisible.map((signal) => <div className="transaction-linked-item" key={signal.id} data-signal-id={signal.id}><span title={[...signal.source.instancePath, signal.source.signalName].join(".")}>{signal.display.name}</span>{renderUnlinkButton(`Unlink ${signal.display.name}`, () => toggle(signal))}</div>)}{linked.length === 0 && <span className="inspector-note">No linked signals</span>}{linked.length > linkedVisible.length && <span className="inspector-note">Showing {linkedVisible.length} of {linked.length}</span>}</div><button type="button" data-testid="open-linked-signal-picker" onClick={() => setPickerOpen((open) => !open)}>{pickerOpen ? "Close signal picker" : "Add signal…"}</button>{pickerOpen && <div className="transaction-signal-picker" data-testid="linked-signal-picker"><label>Search<input aria-label="Search linked signals" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div role="listbox" tabIndex={0} aria-label="Signal search results" aria-activedescendant={results[activeIndex] === undefined ? undefined : `linked-signal-option-${results[activeIndex].id}`} data-testid="linked-signal-results" onKeyDown={handleResultsKeyDown}>{results.map((signal, index) => <div role="option" tabIndex={-1} id={`linked-signal-option-${signal.id}`} aria-selected={linkedIds.has(signal.id)} data-active={String(index === activeIndex)} key={signal.id} onClick={() => toggle(signal)}><span>{linkedIds.has(signal.id) ? "✓ " : ""}{signal.display.name}</span><small>{[...signal.source.instancePath, signal.source.signalName].join(".")}</small></div>)}{results.length === 0 && <span className="inspector-note">No matching signals</span>}</div></div>}</div>;
}
