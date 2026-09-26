import { describe, expect, it } from "vitest";
import { pruneExternalSelection, reconcileExternalDraft, reconcileExternalDraftFields } from "../apps/editor/src/runtime/external-draft-reconciliation.js";

describe("external draft reconciliation", () => {
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

  it("rebases clean Legend fields while retaining a different locally edited field", () => {
    expect(reconcileExternalDraftFields(
      { x: "10", y: "20", orientation: "horizontal" },
      { x: "10", y: "20", orientation: "vertical" },
      { x: "40", y: "20", orientation: "horizontal" },
    )).toEqual({
      value: { x: "40", y: "20", orientation: "vertical" },
      base: { x: "40", y: "20", orientation: "horizontal" },
      conflicts: [],
    });
  });

  it("surfaces conflict only when Canonical changes a field with a local draft", () => {
    expect(reconcileExternalDraftFields(
      { x: "10", show: true },
      { x: "15", show: true },
      { x: "20", show: false },
    )).toEqual({
      value: { x: "15", show: false },
      base: { x: "10", show: false },
      conflicts: ["x"],
    });
  });

  it("accepts a field when the local draft and external Canonical update converge to the same value", () => {
    expect(reconcileExternalDraftFields({ x: "10" }, { x: "20" }, { x: "20" })).toEqual({
      value: { x: "20" },
      base: { x: "20" },
      conflicts: [],
    });
  });
});
