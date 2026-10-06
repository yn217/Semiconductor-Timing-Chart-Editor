import { describe, expect, it } from "vitest";
import { nextEventRowDraft, reconcileEventRowDrafts, type EventRowDraft, type EventRowFields } from "../../apps/editor/src/runtime/event-row-drafts.js";

const committed: EventRowFields = { start: 3, value: "1", comment: "" };
const one = (draft: EventRowDraft | undefined): ReadonlyMap<string, EventRowDraft> => new Map(draft ? [["t3", draft]] : []);

describe("always-editable Transition row drafts", () => {
  it("records an edit against the committed base and clears it when edited back", () => {
    const dirty = nextEventRowDraft(undefined, committed, { ...committed, comment: "note" });
    expect(dirty).toEqual({ base: committed, fields: { ...committed, comment: "note" }, conflict: false });
    expect(nextEventRowDraft(dirty, committed, committed)).toBeUndefined();
  });

  it("keeps a dirty draft when Canonical is unchanged and drops drafts whose row disappeared", () => {
    const drafts = one(nextEventRowDraft(undefined, committed, { ...committed, value: "X" }));
    expect(reconcileEventRowDrafts(drafts, () => committed)).toBe(drafts);
    expect(reconcileEventRowDrafts(drafts, () => undefined).size).toBe(0);
  });

  it("flags, never overwrites, a dirty draft whose row changed elsewhere", () => {
    const drafts = one(nextEventRowDraft(undefined, committed, { ...committed, comment: "local" }));
    const reconciled = reconcileEventRowDrafts(drafts, () => ({ ...committed, value: "X", comment: "external" }));
    expect(reconciled.get("t3")).toEqual({ base: committed, fields: { ...committed, comment: "local" }, conflict: true });
    expect(reconcileEventRowDrafts(reconciled, () => ({ ...committed, value: "X", comment: "external" }))).toBe(reconciled);
  });
});
