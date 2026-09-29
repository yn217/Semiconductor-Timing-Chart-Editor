export type TransactionPresentationViewMode = "Cycle" | "Transaction" | "Split";

/** Coalesce document-ready presentation invalidations without publishing stale React work. */
export function createTransactionPresentationRefreshRequester(input: {
  readonly getViewMode: () => TransactionPresentationViewMode;
  readonly getGeneration: () => number;
  readonly getDocumentEpoch: () => number;
  readonly isActive: () => boolean;
  readonly isDocumentEpochCurrent: (epoch: number) => boolean;
  readonly scheduleFrame: (callback: () => void) => void;
  readonly publish: () => void;
}): () => void {
  let scheduledGeneration = -1;
  return () => {
    if (input.getViewMode() === "Cycle") return;
    const generation = input.getGeneration();
    if (scheduledGeneration === generation) return;
    scheduledGeneration = generation;
    const epoch = input.getDocumentEpoch();
    input.scheduleFrame(() => {
      if (!input.isActive() || !input.isDocumentEpochCurrent(epoch) || input.getGeneration() !== generation || input.getViewMode() === "Cycle") {
        if (scheduledGeneration === generation) scheduledGeneration = -1;
        return;
      }
      input.publish();
    });
  };
}
