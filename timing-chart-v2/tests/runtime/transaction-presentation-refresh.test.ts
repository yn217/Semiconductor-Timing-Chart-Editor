import { describe, expect, it, vi } from "vitest";
import { createTransactionPresentationRefreshRequester, shouldRefreshTransactionPresentation } from "../../apps/editor/src/runtime/transaction-presentation-refresh.js";

describe("transaction presentation revision policy", () => {
  it("skips Cycle-only surfaces while preserving Transaction and Combined invalidations", () => {
    expect(shouldRefreshTransactionPresentation("Cycle", { fullDocumentReplace: true })).toBe(false);
    expect(shouldRefreshTransactionPresentation("Cycle", { transactionSemantics: { changed: true } })).toBe(false);
    expect(shouldRefreshTransactionPresentation("Transaction", { fullDocumentReplace: true })).toBe(true);
    expect(shouldRefreshTransactionPresentation("Split", { transactionSemantics: { changed: true } })).toBe(true);
    expect(shouldRefreshTransactionPresentation("Transaction", {})).toBe(false);
  });
});

describe("transaction presentation refresh requester", () => {
  it("skips Cycle mode and coalesces ready notifications once per generation", () => {
    let mode: "Cycle" | "Transaction" | "Split" = "Cycle";
    let generation = 1;
    let epoch = 3;
    let active = true;
    const frames: Array<() => void> = [];
    const publish = vi.fn();
    const request = createTransactionPresentationRefreshRequester({
      getViewMode: () => mode,
      getGeneration: () => generation,
      getDocumentEpoch: () => epoch,
      isActive: () => active,
      isDocumentEpochCurrent: (candidate) => candidate === epoch,
      scheduleFrame: (callback) => frames.push(callback),
      publish,
    });

    request();
    expect(frames).toHaveLength(0);
    mode = "Transaction";
    request();
    request();
    expect(frames).toHaveLength(1);
    frames.shift()!();
    expect(publish).toHaveBeenCalledTimes(1);
    request();
    expect(frames).toHaveLength(0);

    generation += 1;
    request();
    expect(frames).toHaveLength(1);
    frames.shift()!();
    expect(publish).toHaveBeenCalledTimes(2);

    generation += 1;
    request();
    epoch += 1;
    frames.shift()!();
    expect(publish).toHaveBeenCalledTimes(2);

    request();
    active = false;
    frames.shift()!();
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
