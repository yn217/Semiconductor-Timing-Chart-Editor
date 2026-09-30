/** Select a half-open row window and retain one selected row outside it. */
export function transactionRowsInWindow<T>(
  orderedRows: readonly T[],
  startRow: number,
  endRow: number,
  pinnedRow?: T,
): readonly T[] {
  const start = Math.max(0, Math.min(orderedRows.length, Math.floor(startRow)));
  const end = Math.max(start, Math.min(orderedRows.length, Math.ceil(endRow)));
  const visible = orderedRows.slice(start, end);
  if (pinnedRow !== undefined && !visible.includes(pinnedRow)) visible.push(pinnedRow);
  return visible;
}
