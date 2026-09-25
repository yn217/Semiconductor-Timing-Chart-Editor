import { describe, expect, it } from "vitest";
import { pruneExternalSelection, reconcileExternalDraft } from "../apps/editor/src/runtime/external-draft-reconciliation.js";

describe("Bottom draft reconciliation (#426)", () => {
  const equal = (left: { value: string }, right: { value: string }) => left.value === right.value;

  it("rebases a clean draft to a newer Canonical value", () => {
    expect(reconcileExternalDraft({ value: "old" }, { value: "old" }, { value: "new" }, true, equal)).toEqual({ kind: "rebase", value: { value: "new" } });
  });

  it("requires an explicit decision instead of overwriting a dirty draft or newer Canonical", () => {
    expect(reconcileExternalDraft({ value: "base" }, { value: "my draft" }, { value: "external" }, true, equal)).toEqual({ kind: "conflict" });
  });

  it("rebases a closed editor when Canonical changes", () => {
    expect(reconcileExternalDraft({ value: "old" }, { value: "stale local" }, { value: "new" }, false, equal)).toEqual({ kind: "rebase", value: { value: "new" } });
  });

  it("prunes bulk selections whose transition identities were removed", () => {
    expect([...pruneExternalSelection(new Set(["transition-a", "removed"]), new Set(["transition-a", "transition-b"]))]).toEqual(["transition-a"]);
  });
});
