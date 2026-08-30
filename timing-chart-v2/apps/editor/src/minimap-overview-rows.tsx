import { memo, type CSSProperties } from "react";
import type { MiniMapOverview } from "@timing-chart-v2/projection";

export const MiniMapOverviewRows = memo(function MiniMapOverviewRows({ overview }: { readonly overview: MiniMapOverview }) {
  return <>{overview.rows.map((row) => <span key={row.rowId} data-row-id={row.rowId} style={{ "--minimap-row-index": row.rowIndex } as CSSProperties}>{row.segments.map((segment, index) => <i key={`${row.rowId}-${index}`} className={`minimap-segment minimap-segment-${segment.tone}`} style={{ left: `${Math.max(0, Math.min(100, segment.start / overview.cycleCount * 100))}%`, width: `${Math.max(0.5, Math.min(100, (segment.end - segment.start) / overview.cycleCount * 100))}%` }} />)}</span>)}</>;
});
