import type { SignalId } from "@timing-chart-v2/schema";

/** Presentation-only placement for the Signal Split View. */
export type SignalSplitPane = "upper" | "lower" | "both";

export interface SignalSplitAssignment {
  readonly signalId: SignalId;
  readonly pane: SignalSplitPane;
}

export interface SignalSplitRows {
  /** Canonical order, with each Signal ID appearing at most once. */
  readonly upper: readonly SignalId[];
  /** Canonical order, with each Signal ID appearing at most once. */
  readonly lower: readonly SignalId[];
  /** IDs intentionally presented in both panes, never duplicated in Canonical. */
  readonly both: readonly SignalId[];
}

/**
 * Projects canonical Signal IDs into the two Signal Split panes.  Assignment
 * is presentation state: unknown IDs are ignored and every canonical ID is
 * considered at most once, so a `both` placement never creates a second
 * semantic Signal identity or a second canonical export item.
 */
export function projectSignalSplitRows(canonicalSignalIds: readonly SignalId[], assignments: readonly SignalSplitAssignment[]): SignalSplitRows {
  const assignmentById = new Map<SignalId, SignalSplitPane>();
  for (const assignment of assignments) if (!assignmentById.has(assignment.signalId)) assignmentById.set(assignment.signalId, assignment.pane);
  const canonical = new Set(canonicalSignalIds);
  const upper: SignalId[] = [];
  const lower: SignalId[] = [];
  const both: SignalId[] = [];
  for (const signalId of canonicalSignalIds) {
    // An omitted assignment preserves the pre-Signal-Split single-pane
    // behavior: the canonical Signal is available in both presentation
    // panes. This matches RowLayout's `display.splitPane ?? "both"` rule.
    const pane = assignmentById.get(signalId) ?? "both";
    if (pane === "upper" || pane === "both") upper.push(signalId);
    if (pane === "lower" || pane === "both") lower.push(signalId);
    if (pane === "both") both.push(signalId);
  }
  // The canonical Set is intentionally used as a final guard if this helper
  // is ever fed a malformed duplicate-ID projection source.
  const uniqueCanonicalOrder = (ids: readonly SignalId[]): readonly SignalId[] => {
    const seen = new Set<SignalId>();
    return Object.freeze(ids.filter((id) => canonical.has(id) && !seen.has(id) && seen.add(id)));
  };
  return { upper: uniqueCanonicalOrder(upper), lower: uniqueCanonicalOrder(lower), both: uniqueCanonicalOrder(both) };
}
