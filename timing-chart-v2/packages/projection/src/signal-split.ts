import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";

export interface SignalSplitRows {
  /** Canonical row order, with each Signal ID appearing at most once. */
  readonly upper: readonly SignalId[];
  /** Canonical row order, with each Signal ID appearing at most once. */
  readonly lower: readonly SignalId[];
  /** IDs intentionally presented in both panes, never duplicated in Canonical. */
  readonly both: readonly SignalId[];
}

/**
 * Projects the canonical Signal rows into the two Signal Split panes.
 *
 * Signal Split is a second viewport over the same canonical Signal list.
 * Legacy `display.splitPane` values are intentionally ignored so old
 * documents cannot change membership between the two viewports.
 */
export function projectSignalSplitRows(document: CanonicalDocument): SignalSplitRows {
  const signalById = new Map<SignalId, CanonicalDocument["signals"][number]>(document.signals.map((signal) => [signal.id, signal]));
  const seen = new Set<SignalId>();
  const upper: SignalId[] = [];
  const lower: SignalId[] = [];
  const both: SignalId[] = [];

  for (const rowId of document.signalGroups.flatMap((group) => group.rows)) {
    const signalId = rowId as SignalId;
    const signal = signalById.get(signalId);
    if (!signal || seen.has(signalId)) continue;
    seen.add(signalId);
    upper.push(signalId);
    lower.push(signalId);
    both.push(signalId);
  }

  return {
    upper: Object.freeze(upper),
    lower: Object.freeze(lower),
    both: Object.freeze(both),
  };
}
