import type { SignalId } from "@timing-chart-v2/schema";

/** Owns stable-ID multi-signal selection semantics without owning React state. */
export class SelectionController {
  toggleSignal(current: ReadonlySet<SignalId>, signalId: SignalId, additive: boolean): ReadonlySet<SignalId> {
    const next = additive ? new Set(current) : new Set<SignalId>();
    if (next.has(signalId)) next.delete(signalId); else next.add(signalId);
    if (next.size === 0) next.add(signalId);
    return next;
  }

  primarySignal(selection: ReadonlySet<SignalId>, preferred?: SignalId): SignalId | undefined {
    return preferred && selection.has(preferred) ? preferred : [...selection][0];
  }
}
