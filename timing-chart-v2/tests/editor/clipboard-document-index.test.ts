import { describe, expect, it } from "vitest";
import { clipboardDocumentIndex } from "../../apps/editor/src/application/clipboard-document-index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("clipboard canonical lookup index", () => {
  it("reuses one index per immutable document and resolves stable-ID ownership and source order", () => {
    const document = canonicalFixture();
    const index = clipboardDocumentIndex(document);
    expect(clipboardDocumentIndex(document)).toBe(index);

    for (const [signalIndex, signal] of document.signals.entries()) {
      expect(index.signalsById.get(signal.id)).toEqual({ signal, index: signalIndex });
      const groupIndex = document.signalGroups.findIndex((group) => group.rows.includes(signal.id));
      const rowIndex = document.signalGroups[groupIndex]!.rows.indexOf(signal.id);
      expect(index.signalLocationById.get(signal.id)).toEqual({ group: document.signalGroups[groupIndex], index: rowIndex });
    }
    for (const [transactionIndex, transaction] of document.transactions.entries()) {
      expect(index.transactionsById.get(transaction.id)).toEqual({ transaction, index: transactionIndex });
    }
  });

  it("does not reuse indexes across a replaced canonical collection snapshot", () => {
    const document = canonicalFixture();
    const first = clipboardDocumentIndex(document);
    const replaced = { ...document, signals: [...document.signals] };
    expect(clipboardDocumentIndex(replaced)).not.toBe(first);
  });
});
