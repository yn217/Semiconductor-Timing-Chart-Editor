import { memo, type CSSProperties } from "react";
import type { MiniMapOverview, MiniMapTransactionOverview } from "@timing-chart-v2/projection";

/** #175: MiniMap rows stack inside a clipped box (8px pitch in the Inspector,
 * >= 2px per row in the compact flex layout), so only the first few dozen rows
 * can ever be visible. Mounting one span + segments per Signal put ~30k hidden
 * elements in the document at 10k Signals and made every scroll's Layout and
 * HitTest scale with Signal count. Rows past this bound are never painted. */
export const MINIMAP_MAX_DOM_ROWS = 256;

export const MiniMapOverviewRows = memo(function MiniMapOverviewRows({ overview }: { readonly overview: MiniMapOverview }) {
  return <>{overview.rows.slice(0, MINIMAP_MAX_DOM_ROWS).map((row) => <span key={row.rowId} data-row-id={row.rowId} style={{ "--minimap-row-index": row.rowIndex } as CSSProperties}>{row.segments.map((segment, index) => <i key={`${row.rowId}-${index}`} className={`minimap-segment minimap-segment-${segment.tone}`} style={{ left: `${Math.max(0, Math.min(100, segment.start / overview.cycleCount * 100))}%`, width: `${Math.max(0.5, Math.min(100, (segment.end - segment.start) / overview.cycleCount * 100))}%` }} />)}</span>)}</>;
});

/** #429/#397 Transaction Mode Product Closure P1: same shape/rendering
 * contract as MiniMapOverviewRows above, sized against
 * MiniMapTransactionOverview's own row/segment shape instead -- each
 * segment carries its own resolved Transaction/Group color directly
 * (`--minimap-segment-color`) rather than a closed tone enum, since
 * Transaction color is real per-entity data, not one of a handful of
 * fixed waveform states. */
export const MiniMapTransactionOverviewRows = memo(function MiniMapTransactionOverviewRows({ overview }: { readonly overview: MiniMapTransactionOverview }) {
  return <>{overview.rows.map((row) => <span key={row.key} data-lane-key={row.key} style={{ "--minimap-row-index": row.rowIndex } as CSSProperties}>{row.segments.map((segment, index) => <i key={`${row.key}-${index}`} className="minimap-segment minimap-segment-transaction" style={{ left: `${Math.max(0, Math.min(100, segment.start / overview.cycleCount * 100))}%`, width: `${Math.max(0.5, Math.min(100, (segment.end - segment.start) / overview.cycleCount * 100))}%`, "--minimap-segment-color": segment.color } as CSSProperties} />)}</span>)}</>;
});
