/** Injective opaque presentation key; semantic identity remains the structured tuple. */
export function transactionLaneIdentityKey(groupId: string | undefined, laneId: string): string {
  return JSON.stringify([groupId ?? null, laneId]);
}

/**
 * Natural (numeric-aware) lane ID comparator: `lane_2` sorts before `lane_10`.
 * Non-numeric runs compare by code unit, matching the previous default sort
 * for names without digits.
 */
export function compareLaneIds(left: string, right: string): number {
  const pattern = /\d+|\D+/g;
  const leftParts = left.match(pattern) ?? [];
  const rightParts = right.match(pattern) ?? [];
  const count = Math.min(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    const a = leftParts[index]!;
    const b = rightParts[index]!;
    const aNumeric = /^\d/.test(a);
    const bNumeric = /^\d/.test(b);
    if (aNumeric && bNumeric) {
      const aDigits = a.replace(/^0+(?=\d)/, "");
      const bDigits = b.replace(/^0+(?=\d)/, "");
      if (aDigits.length !== bDigits.length) return aDigits.length - bDigits.length;
      if (aDigits !== bDigits) return aDigits < bDigits ? -1 : 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  if (leftParts.length !== rightParts.length) return leftParts.length - rightParts.length;
  return left < right ? -1 : left > right ? 1 : 0;
}
