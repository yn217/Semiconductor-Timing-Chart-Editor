import type { RowId, Signal, SignalId } from "@timing-chart-v2/schema";

/** Resolve a Group's Signal rows in canonical row order using the caller's existing ID index. */
export function resolveGroupSignalsInRowOrder(rowIds: readonly RowId[], signalsById: ReadonlyMap<SignalId, Signal>): readonly Signal[] {
  const signals: Signal[] = [];
  for (const rowId of rowIds) {
    const signal = signalsById.get(rowId as SignalId);
    if (signal !== undefined) signals.push(signal);
  }
  return signals;
}
