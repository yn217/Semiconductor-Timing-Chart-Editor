import { describe, expect, it } from "vitest";
import { normalizedActiveContextFor } from "../../apps/editor/src/workspace/use-workspace-ui-state.js";

// #404: ActiveContext (Signal | Transaction) is a state family separate
// from ViewMode/Selection/WorkspacePreset. `normalizedActiveContextFor` is
// the one place a ViewMode change is allowed to touch ActiveContext --
// this tests that normalization contract directly, since the hook itself
// has no observable UI effect yet (this issue is explicitly state-only,
// no Ribbon change).
describe("ActiveContext normalization (#404)", () => {
  it("normalizes to Signal when entering Cycle, regardless of the prior context", () => {
    expect(normalizedActiveContextFor("Cycle", "Transaction")).toBe("Signal");
    expect(normalizedActiveContextFor("Cycle", "Signal")).toBe("Signal");
  });

  it("normalizes to Transaction when entering Transaction, regardless of the prior context", () => {
    expect(normalizedActiveContextFor("Transaction", "Signal")).toBe("Transaction");
    expect(normalizedActiveContextFor("Transaction", "Transaction")).toBe("Transaction");
  });

  it("preserves whatever ActiveContext was already explicitly set when entering Split", () => {
    expect(normalizedActiveContextFor("Split", "Signal")).toBe("Signal");
    expect(normalizedActiveContextFor("Split", "Transaction")).toBe("Transaction");
  });
});
