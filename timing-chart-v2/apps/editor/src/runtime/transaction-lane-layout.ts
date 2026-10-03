export const TRANSACTION_LANE_ROW_HEIGHT = 40;

/** The sticky label band must reserve the same vertical span as its packed track rows. */
export function transactionLaneBandHeights(rowCount: number): Readonly<{ labelHeight: number; trackHeight: number }> {
  const height = Math.max(rowCount, 1) * TRANSACTION_LANE_ROW_HEIGHT;
  return Object.freeze({ labelHeight: height, trackHeight: height });
}
