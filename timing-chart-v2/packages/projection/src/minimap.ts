import type { CanonicalDocument, RowId, Signal, SignalValueChange } from "@timing-chart-v2/schema";

export type MiniMapTone = "low" | "high" | "clock" | "comment";

export interface MiniMapSegment {
  readonly start: number;
  readonly end: number;
  readonly tone: MiniMapTone;
}

export interface MiniMapOverviewRow {
  readonly rowId: RowId;
  readonly rowIndex: number;
  readonly segments: readonly MiniMapSegment[];
}

export interface MiniMapOverview {
  readonly cycleCount: number;
  readonly rows: readonly MiniMapOverviewRow[];
  /** Number of stable row-to-signal lookups performed while deriving this model. */
  readonly signalLookups: number;
}

function valueSegments(values: readonly SignalValueChange[], cycleCount: number): readonly MiniMapSegment[] {
  return values.map((change, index) => ({
    start: change.start,
    end: values[index + 1]?.start ?? cycleCount,
    tone: String(change.value).toLowerCase() === "0" ? "low" : "high",
  }));
}

function segmentsForSignal(signal: Signal | undefined, cycleCount: number): readonly MiniMapSegment[] {
  if (!signal || signal.type === "commentRow") return [{ start: 0, end: cycleCount, tone: "comment" }];
  if (signal.type === "clock") return [{ start: 0, end: cycleCount, tone: "clock" }];
  return valueSegments(signal.values, cycleCount);
}

/**
 * Derive the static MiniMap overview from CanonicalDocument once per document
 * identity. The renderer can then update the viewport rectangle independently.
 */
export function buildMiniMapOverview(document: Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">): MiniMapOverview {
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  const signalById = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const rowIds = document.signalGroups.flatMap((group) => group.rows);
  const rows = rowIds.map((rowId, rowIndex) => ({
    rowId,
    rowIndex,
    segments: segmentsForSignal(signalById.get(rowId), cycleCount),
  }));
  return Object.freeze({ cycleCount, rows: Object.freeze(rows), signalLookups: rowIds.length });
}
