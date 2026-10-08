import { describe, expect, it, vi } from "vitest";
import { createBottomEditorActions } from "../../apps/editor/src/application/bottom-editor-actions.js";

describe("bottom editor action controller", () => {
  for (const kind of ["Signal", "Annotation", "Transaction"] as const) {
    for (const scenario of ["selected-target", "unrelated-selection", "bulk-selection", "rejected"] as const) {
      it(`pinned ${kind} delete repairs only deleted IDs: ${scenario}`, () => {
        const ids = scenario === "unrelated-selection" ? ["B"] : scenario === "bulk-selection" ? ["A", "B"] : ["A"];
        const primary = scenario === "bulk-selection" || scenario === "unrelated-selection" ? "B" : "A";
        const repair = vi.fn();
        const deleteTarget = vi.fn(() => ({ ok: scenario !== "rejected" }));
        const selection = {
          refs: { signalIds: { current: new Set(ids) }, annotationIds: { current: new Set(ids) }, transactionIds: { current: new Set(ids) } },
          selectSignals: repair, selectAnnotations: repair, selectTransactions: repair,
        };
        const actions = createBottomEditorActions({
          application: {}, document: {}, nextCommandId: vi.fn(),
          editActions: { deleteSignal: deleteTarget, deleteAnnotation: deleteTarget, deleteTransaction: deleteTarget },
          selection, bottomSignal: "A", bottomAnnotation: { id: "A" }, bottomTransaction: { id: "A" },
          bottomPinnedRef: { current: true }, bottomPinned: true,
          selectedSignalRef: { current: primary }, selectedAnnotationRef: { current: primary }, selectedTransactionRef: { current: primary },
          setBottomPinned: vi.fn(), setPinnedBottomSelection: vi.fn(), followSelection: true,
        } as never);
        actions[`deleteBottom${kind}`]();
        expect(deleteTarget).toHaveBeenCalledExactlyOnceWith("A");
        if (scenario === "unrelated-selection" || scenario === "rejected") expect(repair).not.toHaveBeenCalled();
        else expect(repair).toHaveBeenCalledExactlyOnceWith(new Set(scenario === "bulk-selection" ? ["B"] : []), primary);
      });
    }
  }

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
