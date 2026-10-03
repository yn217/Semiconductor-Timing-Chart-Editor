import { useId, useMemo, useState } from "react";
import type { Signal, SignalId } from "@timing-chart-v2/schema";
import { signalPickerIndex } from "./signal-picker-index.js";

const MAX_VISIBLE_RESULTS = 50;

export function SignalIdPicker({ signals, value, label, onChange, noneLabel }: {
  readonly signals: readonly Signal[];
  readonly value: SignalId | undefined;
  readonly label: string;
  readonly onChange: (value: SignalId | undefined) => void;
  readonly noneLabel?: string;
}) {
  const listboxId = useId();
  const index = signalPickerIndex(signals);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = value === undefined ? undefined : index.byId.get(value);
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
  const filtered = useMemo(() => normalizedQuery
    ? index.entries.filter((entry) => entry.searchText.includes(normalizedQuery))
    : index.entries, [index, normalizedQuery]);
  const visible = filtered.slice(0, MAX_VISIBLE_RESULTS);
  const noneOffset = noneLabel === undefined ? 0 : 1;
  const choiceCount = visible.length + noneOffset;
  const activeEntry = visible[activeIndex - noneOffset];

  const choose = (id: SignalId | undefined) => {
    onChange(id);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  return <div className="signal-id-picker" data-testid="signal-id-picker">
    <input
      role="combobox"
      aria-label={label}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open ? activeIndex === 0 && noneLabel !== undefined ? `${listboxId}-none` : activeEntry ? `${listboxId}-${activeEntry.id}` : undefined : undefined}
      value={open ? query : selected?.label ?? (value === undefined ? noneLabel ?? "" : "")}
      placeholder={noneLabel}
      onFocus={() => { setQuery(""); setActiveIndex(0); setOpen(true); }}
      onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((current) => Math.min(current + 1, Math.max(0, choiceCount - 1))); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveIndex((current) => Math.max(0, current - 1)); }
        else if (event.key === "Enter" && open) { event.preventDefault(); if (activeIndex === 0 && noneLabel !== undefined) choose(undefined); else if (activeEntry) choose(activeEntry.id); }
        else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(""); setActiveIndex(0); }
      }}
      onBlur={() => { setOpen(false); setQuery(""); setActiveIndex(0); }}
    />
    {open && <div id={listboxId} role="listbox" aria-label={`${label} results`} className="signal-id-picker-results">
      {noneLabel !== undefined && <div id={`${listboxId}-none`} role="option" aria-selected={value === undefined} data-active={String(activeIndex === 0)} className="signal-id-picker-option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(undefined)}>{noneLabel}</div>}
      {visible.map((entry, resultIndex) => <div
        id={`${listboxId}-${entry.id}`}
        role="option"
        aria-selected={entry.id === value}
        data-active={String(resultIndex + noneOffset === activeIndex)}
        className="signal-id-picker-option"
        key={entry.id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(entry.id)}
      >{entry.label}</div>)}
      {visible.length === 0 && <div className="signal-id-picker-empty">No matching signals</div>}
      {filtered.length > visible.length && <div className="signal-id-picker-count">Showing {visible.length} of {filtered.length}; type to narrow</div>}
    </div>}
  </div>;
}
