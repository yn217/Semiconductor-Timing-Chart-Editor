import type { Signal } from "@timing-chart-v2/schema";

export type PickableSignal = Exclude<Signal, { readonly type: "commentRow" }>;

export interface SignalPickerEntry {
  readonly id: PickableSignal["id"];
  readonly label: string;
  readonly fullPath: string;
  readonly type: PickableSignal["type"];
  readonly normalizedSearchText: string;
  readonly signal: PickableSignal;
}

export interface SignalPickerIndex {
  readonly entries: readonly SignalPickerEntry[];
  readonly byId: ReadonlyMap<PickableSignal["id"], SignalPickerEntry>;
}

const indexesBySignalCollection = new WeakMap<readonly Signal[], SignalPickerIndex>();

/** Shared stable-ID search model, built once for each immutable Signal collection. */
export function signalPickerIndex(signals: readonly Signal[]): SignalPickerIndex {
  const cached = indexesBySignalCollection.get(signals);
  if (cached) return cached;

  const entries = signals.flatMap((signal): SignalPickerEntry[] => {
    if (signal.type === "commentRow") return [];
    const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".");
    const label = signal.display.name;
    return [{
      id: signal.id,
      label,
      fullPath,
      type: signal.type,
      normalizedSearchText: `${label} ${fullPath}`.toLocaleLowerCase(),
      signal,
    }];
  });
  const index = { entries, byId: new Map(entries.map((entry) => [entry.id, entry] as const)) };
  indexesBySignalCollection.set(signals, index);
  return index;
}

export const SIGNAL_PICKER_RESULT_LIMIT = 50;

/** Minimal vertical scroll needed to keep the keyboard-active option visible. */
export function signalPickerScrollAdjustment(containerTop: number, containerBottom: number, optionTop: number, optionBottom: number): number {
  if (optionTop < containerTop) return optionTop - containerTop;
  if (optionBottom > containerBottom) return optionBottom - containerBottom;
  return 0;
}

export function searchSignalPicker(index: SignalPickerIndex, query: string, limit = SIGNAL_PICKER_RESULT_LIMIT): readonly SignalPickerEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results: SignalPickerEntry[] = [];
  for (const entry of index.entries) {
    if (normalizedQuery && !entry.normalizedSearchText.includes(normalizedQuery)) continue;
    results.push(entry);
    if (results.length >= limit) break;
  }
  return results;
}
