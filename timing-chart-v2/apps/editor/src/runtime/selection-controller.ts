import type { SignalId } from "@timing-chart-v2/schema";

/** Owns stable-ID multi-signal selection semantics without owning React state. */
export class SelectionController {
  private selection = new Set<SignalId>();

  toggleSignal(current: ReadonlySet<SignalId>, signalId: SignalId, additive: boolean): ReadonlySet<SignalId> {
    const next = additive ? new Set(current) : new Set<SignalId>();
    if (next.has(signalId)) next.delete(signalId); else next.add(signalId);
    if (next.size === 0) next.add(signalId);
    this.selection = new Set(next);
    return next;
  }

  clear(): ReadonlySet<SignalId> {
    this.selection.clear();
    return new Set();
  }

  current(): ReadonlySet<SignalId> { return new Set(this.selection); }

  replace(selection: ReadonlySet<SignalId>): ReadonlySet<SignalId> {
    this.selection = new Set(selection);
    return new Set(this.selection);
  }

  primarySignal(selection: ReadonlySet<SignalId>, preferred?: SignalId): SignalId | undefined {
    return preferred && selection.has(preferred) ? preferred : [...selection][0];
  }
}
