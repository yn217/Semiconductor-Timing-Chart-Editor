/** Injective opaque presentation key; semantic identity remains the structured tuple. */
export function transactionLaneIdentityKey(groupId: string | undefined, laneId: string): string {
  return JSON.stringify([groupId ?? null, laneId]);
}
