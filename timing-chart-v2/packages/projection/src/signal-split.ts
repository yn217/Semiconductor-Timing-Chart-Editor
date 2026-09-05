import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";

/** Presentation-only placement for the Signal Split View. */
export type SignalSplitPane = "upper" | "lower" | "both";

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
 * `signal.display.splitPane` is the only assignment source. An omitted
 * assignment means `both`, preserving the existing single-pane behavior for
 * documents that predate Signal Split. Row order and membership come from
 * the canonical document, so a second standalone assignment list cannot drift
 * from the Signal identity or introduce a second semantic export item.
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
    const pane: SignalSplitPane = signal.display.splitPane ?? "both";
    if (pane === "upper" || pane === "both") upper.push(signalId);
    if (pane === "lower" || pane === "both") lower.push(signalId);
    if (pane === "both") both.push(signalId);
  }

  return {
    upper: Object.freeze(upper),
    lower: Object.freeze(lower),
    both: Object.freeze(both),
  };
}
