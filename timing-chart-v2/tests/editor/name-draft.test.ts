import { expect, it } from "vitest";
import { reconcileNameDraft } from "../../apps/editor/src/name-draft.js";

it("invalidates same-name targets, replacement snapshots, canonical changes and deletion", () => {
  const target = { id: "a" };
  const draft = { target, base: "DATA", value: "Pending A", error: "Rejected A" };
  expect(reconcileNameDraft(draft, target, "DATA")).toBe(draft);
  for (const next of [{ id: "b" }, { id: "a" }, undefined]) {
    expect(reconcileNameDraft(draft, next, "DATA")).toEqual({ target: next, base: "DATA", value: "DATA", error: "" });
  }
  expect(reconcileNameDraft(draft, target, "Restored").value).toBe("Restored");
});
