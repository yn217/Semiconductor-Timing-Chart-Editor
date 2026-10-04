export const TRANSACTION_LANE_ROW_HEIGHT = 40;

/** The sticky label band must reserve the same vertical span as its packed track rows. */
export function transactionLaneBandHeights(rowCount: number): Readonly<{ labelHeight: number; trackHeight: number }> {
  const height = Math.max(rowCount, 1) * TRANSACTION_LANE_ROW_HEIGHT;
  return Object.freeze({ labelHeight: height, trackHeight: height });
}

export type TransactionVerticalBand = Readonly<{
  key: string;
  trackTop: number;
  trackHeight: number;
  labelTop: number;
  labelHeight: number;
}>;

/** Select vertically intersecting, ordered non-overlapping Lane bands without scanning the full Lane domain. */
export function transactionLaneBandsInVerticalWindow<T extends TransactionVerticalBand>(
  bands: readonly T[],
  start: number,
  end: number,
  pinnedBand?: T,
): Readonly<{ bands: readonly T[]; visits: number }> {
  if (bands.length === 0 || !(end > start)) return { bands: pinnedBand ? [pinnedBand] : [], visits: 0 };
  let low = 0;
  let high = bands.length;
  let visits = 0;
  while (low < high) {
    visits += 1;
    const middle = low + Math.floor((high - low) / 2);
    const band = bands[middle]!;
    if (Math.max(band.trackTop + band.trackHeight, band.labelTop + band.labelHeight) <= start) low = middle + 1;
    else high = middle;
  }
  const visible: T[] = [];
  for (let index = low; index < bands.length; index += 1) {
    const band = bands[index]!;
    visits += 1;
    if (Math.min(band.trackTop, band.labelTop) >= end) break;
    const trackVisible = band.trackTop < end && band.trackTop + band.trackHeight > start;
    const labelVisible = band.labelTop < end && band.labelTop + band.labelHeight > start;
    if (trackVisible || labelVisible) visible.push(band);
  }
  if (pinnedBand && !visible.some((band) => band.key === pinnedBand.key)) visible.push(pinnedBand);
  return { bands: visible, visits };
}
