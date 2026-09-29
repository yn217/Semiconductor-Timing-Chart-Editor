import type { RowId } from "@timing-chart-v2/schema";
import type { RowLayoutEntry } from "./types.js";

export interface PinnedRowProjection {
  readonly rowLayout: readonly RowLayoutEntry[];
  readonly navigationRowLayout: readonly RowLayoutEntry[];
  readonly pinnedRowIds: readonly RowId[];
}

/** Projects stable-ID pins into the visible row coordinates without changing
 * canonical row order, row heights, or the cached base layout. */
export function projectPinnedRows(input: {
  readonly visibleRowLayout: readonly RowLayoutEntry[];
  readonly rowLayout: readonly RowLayoutEntry[];
  readonly navigationRowLayout: readonly RowLayoutEntry[];
  readonly stickyRowIds: readonly RowId[];
  readonly viewportStartY: number;
  readonly leadingHeaderHeight: number;
}): PinnedRowProjection {
  const requested = new Set(input.stickyRowIds);
  const visibleRows = input.visibleRowLayout.filter((row) => row.kind === "timing" && row.visible && requested.has(row.rowId));
  if (visibleRows.length === 0) {
    return { rowLayout: input.rowLayout, navigationRowLayout: input.navigationRowLayout, pinnedRowIds: [] };
  }

  let nextPinnedY = Math.max(0, input.viewportStartY) + Math.max(0, input.leadingHeaderHeight);
  const projectedY = new Map<RowId, number>();
  for (const row of visibleRows) {
    const y = Math.max(row.y, nextPinnedY);
    projectedY.set(row.rowId, y);
    nextPinnedY = y + row.height;
  }
  const pins = new Set(projectedY.keys());
  const apply = (rows: readonly RowLayoutEntry[]) => rows.map((row) => {
    const y = projectedY.get(row.rowId);
    if (y === undefined) return row;
    return { ...row, y, pinned: true };
  });
  return {
    rowLayout: apply(input.rowLayout),
    navigationRowLayout: apply(input.navigationRowLayout),
    pinnedRowIds: [...pins],
  };
}
