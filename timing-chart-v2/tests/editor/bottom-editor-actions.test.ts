import { describe, expect, it, vi } from "vitest";
import { createBottomEditorActions } from "../../apps/editor/src/application/bottom-editor-actions.js";

describe("bottom editor action controller", () => {
  it("routes linked-signal toggles through the application owner", () => {
    const execute = vi.fn(() => ({ ok: true }));
    const actions = createBottomEditorActions({
      application: { execute } as never,
      editActions: {} as never,
      document: { transactions: [{ id: "txn", linkedSignals: ["sig_a"] }] } as never,
      nextCommandId: (operation) => operation as never,
      selection: {} as never,
      bottomSignal: undefined,
      bottomAnnotation: undefined,
      bottomTransaction: undefined,
      bottomPinnedRef: { current: false },
      selectedSignalRef: { current: undefined },
      selectedAnnotationRef: { current: undefined },
      selectedTransactionRef: { current: undefined },
      bottomPinned: false,
      setBottomPinned: vi.fn(),
      setPinnedBottomSelection: vi.fn(),
      selectedSignalId: undefined,
      selectedGroupId: undefined,
      selectedAnnotationId: undefined,
      selectedTransactionId: undefined,
      selectedBookmarkId: undefined,
    });

    actions.toggleTransactionSignal("txn" as never, "sig_a" as never);

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ id: "transaction_link", type: "transaction.unlinkSignal", transactionId: "txn", signalId: "sig_a" }));
  });

  it("pins the current bottom selection through the view-state boundary", () => {
    const setBottomPinned = vi.fn();
    const setPinnedBottomSelection = vi.fn();
    const actions = createBottomEditorActions({
      application: {} as never,
      editActions: {} as never,
      document: { transactions: [] } as never,
      nextCommandId: vi.fn() as never,
      selection: {} as never,
      bottomSignal: undefined,
      bottomAnnotation: undefined,
      bottomTransaction: undefined,
      bottomPinnedRef: { current: false },
      selectedSignalRef: { current: undefined },
      selectedAnnotationRef: { current: undefined },
      selectedTransactionRef: { current: undefined },
      bottomPinned: false,
      setBottomPinned,
      setPinnedBottomSelection,
      selectedSignalId: "sig_a" as never,
      selectedGroupId: undefined,
      selectedAnnotationId: undefined,
      selectedTransactionId: undefined,
      selectedBookmarkId: "bookmark_a" as never,
    });

    actions.toggleBottomPin();

    expect(setPinnedBottomSelection).toHaveBeenCalledWith({ signalId: "sig_a", bookmarkId: "bookmark_a" });
    expect(setBottomPinned).toHaveBeenCalledWith(true);
  });
});
