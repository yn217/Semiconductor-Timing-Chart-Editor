import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Signal, SignalId } from "@timing-chart-v2/schema";
import { searchSignalPicker, SIGNAL_PICKER_RESULT_LIMIT, signalPickerIndex, signalPickerScrollAdjustment } from "./signal-picker-model.js";

export function SignalPicker({ signals, value, onChange, ariaLabel, emptyLabel }: {
  readonly signals: readonly Signal[];
  readonly value: SignalId | undefined;
  readonly onChange: (signalId: SignalId | undefined) => void;
  readonly ariaLabel: string;
  readonly emptyLabel?: string;
}) {
  const listboxId = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const activeOptionRef = useRef<HTMLDivElement>(null);
  const index = signalPickerIndex(signals);
  const selected = value === undefined ? undefined : index.byId.get(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => searchSignalPicker(index, query), [index, query]);
  const optionOffset = emptyLabel === undefined ? 0 : 1;
  const optionCount = results.length + optionOffset;
  const activeId = activeIndex < optionOffset ? `${listboxId}-empty` : results[activeIndex - optionOffset]?.id;

  useLayoutEffect(() => {
    const listbox = listboxRef.current;
    const option = activeOptionRef.current;
    if (!open || !listbox || !option) return;
    const listboxRect = listbox.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    listbox.scrollTop += signalPickerScrollAdjustment(listboxRect.top, listboxRect.bottom, optionRect.top, optionRect.bottom);
  }, [activeIndex, open, optionOffset, results]);

  const select = (signalId: SignalId | undefined) => {
    onChange(signalId);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  };
  const moveActive = (delta: number) => setActiveIndex((current) => Math.max(0, Math.min(Math.max(0, optionCount - 1), current + delta)));

  return <div className="signal-picker" data-testid="signal-picker">
    <input
      type="text"
      role="combobox"
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open && optionCount > 0 ? `${listboxId}-option-${activeId}` : undefined}
      value={open ? query : selected?.label ?? emptyLabel ?? ""}
      placeholder={selected?.label ?? emptyLabel ?? "Search Signals…"}
      onFocus={() => { setQuery(""); setActiveIndex(0); setOpen(true); }}
      onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && open) { event.preventDefault(); moveActive(1); }
        else if (event.key === "ArrowUp" && open) { event.preventDefault(); moveActive(-1); }
        else if (event.key === "Home" && open && optionCount > 0) { event.preventDefault(); setActiveIndex(0); }
        else if (event.key === "End" && open && optionCount > 0) { event.preventDefault(); setActiveIndex(optionCount - 1); }
        else if (event.key === "Enter" && open && optionCount > 0) {
          event.preventDefault();
          if (activeIndex < optionOffset) select(undefined);
          else select(results[activeIndex - optionOffset]!.id);
        } else if (event.key === "Escape" && open) { event.preventDefault(); setQuery(""); setOpen(false); }
      }}
    />
    {open && <div ref={listboxRef} id={listboxId} role="listbox" aria-label={`${ariaLabel} results`} className="signal-picker-results">
      {emptyLabel !== undefined && <div ref={activeIndex === 0 ? activeOptionRef : undefined} id={`${listboxId}-option-${listboxId}-empty`} role="option" aria-selected={value === undefined} data-active={String(activeIndex === 0)} onMouseDown={(event) => event.preventDefault()} onClick={() => select(undefined)}>{emptyLabel}</div>}
      {results.map((entry, resultIndex) => {
        const optionIndex = resultIndex + optionOffset;
        const optionId = `${listboxId}-option-${entry.id}`;
        return <div ref={activeIndex === optionIndex ? activeOptionRef : undefined} id={optionId} role="option" aria-selected={value === entry.id} data-active={String(activeIndex === optionIndex)} key={entry.id} onMouseDown={(event) => event.preventDefault()} onClick={() => select(entry.id)}>
          <span>{entry.label}</span>{entry.fullPath && entry.fullPath !== entry.label && <small>{entry.fullPath}</small>}
        </div>;
      })}
      {results.length === 0 && <span className="inspector-note">No matching signals</span>}
      {results.length === SIGNAL_PICKER_RESULT_LIMIT && <span className="inspector-note">Showing first {SIGNAL_PICKER_RESULT_LIMIT} results. Refine the search.</span>}
    </div>}
  </div>;
}
