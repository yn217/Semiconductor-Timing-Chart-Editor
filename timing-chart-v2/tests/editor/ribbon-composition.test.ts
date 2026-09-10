import { describe, expect, it } from "vitest";
import { composeRibbon, type RibbonContextGroups } from "../../apps/editor/src/ribbon-composition.js";
import { partitionRibbonItems, resolveRibbonPresentation, type RibbonGroupSpec } from "../../apps/editor/src/ribbon-schema.js";

function group(id: string): RibbonGroupSpec {
  return { id, majorGroup: id, caption: id, items: [] };
}

describe("composeRibbon (#405)", () => {
  it("uses one declared order for common and contextual groups", () => {
    const groups = { common: [group("file"), group("zoom")], bySignal: [group("cycle")], byTransaction: [group("transaction")] };
    const order = ["file", "cycle", "transaction", "zoom"];
    expect(composeRibbon(groups, { viewMode: "Cycle", activeContext: "Signal" }, order).map(g => g.id)).toEqual(["file", "cycle", "zoom"]);
    expect(composeRibbon(groups, { viewMode: "Split", activeContext: "Transaction" }, order).map(g => g.id)).toEqual(["file", "transaction", "zoom"]);
  });
  const groups: RibbonContextGroups = {
    common: [group("edit"), group("clipboard")],
    bySignal: [group("insert"), group("zoom")],
    byTransaction: [group("phases"), group("lanes")],
  };

  it("composes Common groups followed by the Signal-context groups when ActiveContext is Signal", () => {
    const composed = composeRibbon(groups, { viewMode: "Cycle", activeContext: "Signal" });
    expect(composed.map((item) => item.id)).toEqual(["edit", "clipboard", "insert", "zoom"]);
  });

  it("composes Common groups followed by the Transaction-context groups when ActiveContext is Transaction", () => {
    const composed = composeRibbon(groups, { viewMode: "Transaction", activeContext: "Transaction" });
    expect(composed.map((item) => item.id)).toEqual(["edit", "clipboard", "phases", "lanes"]);
  });

  it("produces the exact same group order every time for the same context (deterministic composition)", () => {
    const first = composeRibbon(groups, { viewMode: "Cycle", activeContext: "Signal" }).map((item) => item.id);
    const second = composeRibbon(groups, { viewMode: "Cycle", activeContext: "Signal" }).map((item) => item.id);
    expect(second).toEqual(first);
  });

  it("Common groups are the exact same array references in both contexts -- one shared owner, not duplicated per context", () => {
    const signalComposed = composeRibbon(groups, { viewMode: "Cycle", activeContext: "Signal" });
    const transactionComposed = composeRibbon(groups, { viewMode: "Transaction", activeContext: "Transaction" });
    expect(signalComposed[0]).toBe(groups.common[0]);
    expect(transactionComposed[0]).toBe(groups.common[0]);
  });

  it("Split ActiveContext falls back to the Signal-context groups (not a third parallel group set)", () => {
    // ActiveContext itself is only ever "Signal" | "Transaction" (#404) --
    // this documents that composeRibbon's own branch treats anything other
    // than "Transaction" as the Signal-context group set, matching that
    // two-value contract rather than silently needing a third case.
    const composed = composeRibbon(groups, { viewMode: "Split", activeContext: "Signal" });
    expect(composed.map((item) => item.id)).toEqual(["edit", "clipboard", "insert", "zoom"]);
  });

  it("degrades command presentation deterministically without breaking word labels", () => {
    const presentation = { preferredSize: "large" as const, compactSize: "small" as const, overflow: "allowed" as const };
    expect(resolveRibbonPresentation(presentation, "large")).toBe("large");
    expect(resolveRibbonPresentation(presentation, "medium")).toBe("small");
    expect(resolveRibbonPresentation({ ...presentation, overflow: "never" }, "icon")).toBe("icon");
    expect(resolveRibbonPresentation({ ...presentation, overflow: "preferred" }, "small")).toBe("overflow");
  });

  it("partitions overflow candidates without changing command identity or order", () => {
    const source = group("adaptive").items;
    const result = partitionRibbonItems(source, "small");
    expect(result.visible.map((item) => item.id)).toEqual(source.filter((item) => !item.presentation || resolveRibbonPresentation(item.presentation, "small") !== "overflow").map((item) => item.id));
    expect(result.overflow.every((item) => item.presentation && resolveRibbonPresentation(item.presentation, "small") === "overflow")).toBe(true);
    expect(new Set([...result.visible, ...result.overflow].map((item) => item.id)).size).toBe(source.length);
  });
});
