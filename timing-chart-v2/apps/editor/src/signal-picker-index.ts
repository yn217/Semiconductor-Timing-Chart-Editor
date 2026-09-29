import type { Signal, SignalId } from "@timing-chart-v2/schema";

export type SignalPickerEntry = Readonly<{
  id: SignalId;
  label: string;
  searchText: string;
}>;

export type SignalPickerIndex = Readonly<{
  entries: readonly SignalPickerEntry[];
  byId: ReadonlyMap<SignalId, SignalPickerEntry>;
  labelsById: ReadonlyMap<SignalId, string>;
}>;

const indexes = new WeakMap<readonly Signal[], SignalPickerIndex>();

/** Share one stable-ID picker projection across fields using the same immutable Signal collection. */
export function signalPickerIndex(signals: readonly Signal[]): SignalPickerIndex {
  const cached = indexes.get(signals);
  if (cached !== undefined) return cached;

  const entries: SignalPickerEntry[] = [];
  const byId = new Map<SignalId, SignalPickerEntry>();
  const labelsById = new Map<SignalId, string>();
  for (const signal of signals) {
    if (signal.type === "commentRow") continue;
    const label = signal.display.name;
    const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".");
    const entry = Object.freeze({ id: signal.id, label, searchText: `${label} ${fullPath}`.normalize("NFKC").toLowerCase() });
    entries.push(entry);
    byId.set(signal.id, entry);
    labelsById.set(signal.id, label);
  }
  const index = Object.freeze({ entries: Object.freeze(entries), byId, labelsById });
  indexes.set(signals, index);
  return index;
}
