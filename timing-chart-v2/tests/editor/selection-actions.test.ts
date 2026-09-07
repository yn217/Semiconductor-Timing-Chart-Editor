import { describe, expect, it, vi } from "vitest";
import { createSelectionActions } from "../../apps/editor/src/application/selection-actions.js";

describe("selection action controller", () => {
  it("selects every semantic signal without selecting comment rows", () => {
    const selection = { selectSignals: vi.fn() };
    const actions = createSelectionActions({
      document: { signals: [{ id: "sig_a", type: "binary" }, { id: "comment", type: "commentRow" }] } as never,
      selection: selection as never,
      hostRef: { current: null },
      selectedSignalId: undefined,
    });

    actions.selectAllSignals();

    expect(selection.selectSignals).toHaveBeenCalledWith(new Set(["sig_a"]), "sig_a");
  });

  it("does not select a hierarchy id that is absent from the current document", () => {
    const selection = { selectSignal: vi.fn() };
    const actions = createSelectionActions({
      document: { signals: [{ id: "sig_a", type: "binary" }] } as never,
      selection: selection as never,
      hostRef: { current: null },
      selectedSignalId: undefined,
    });

    actions.selectHierarchySignal("missing" as never);

    expect(selection.selectSignal).not.toHaveBeenCalled();
  });
});
