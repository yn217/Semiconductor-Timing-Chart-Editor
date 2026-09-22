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

describe("Ribbon extensibility (#441): adding commands never loses or reorders existing ones", () => {
  const sizes = ["large", "medium", "small", "icon"] as const;
  const item = (id: string, overflow: "allowed" | "preferred" | "never", preferredSize: "large" | "medium" | "small" | "icon" = "large") =>
    ({ kind: "button" as const, id, icon: "i-plus", label: id, presentation: { preferredSize, compactSize: "small" as const, overflow } }) as unknown as RibbonGroupSpec["items"][number];
  const base = Array.from({ length: 12 }, (_, index) => item("base-" + index, (["allowed", "preferred", "never"] as const)[index % 3]!, sizes[index % 4]!));
  const extra = Array.from({ length: 30 }, (_, index) => item("extra-" + index, (["allowed", "preferred", "never"] as const)[(index + 1) % 3]!, sizes[(index + 2) % 4]!));

  it("partitions a non-empty command set losslessly at every available size", () => {
    for (const size of sizes) {
      const result = partitionRibbonItems(base, size);
      const ids = [...result.visible, ...result.overflow].map((entry) => entry.id).sort();
      expect(ids).toEqual(base.map((entry) => entry.id).sort());
      expect(result.visible.map((entry) => entry.id)).toEqual(base.filter((entry) => result.visible.includes(entry)).map((entry) => entry.id));
    }
    // A vacuous fixture would hide regressions: the fixture must actually exercise both outcomes.
    expect(partitionRibbonItems(base, "small").overflow.length).toBeGreaterThan(0);
    expect(partitionRibbonItems(base, "small").visible.length).toBeGreaterThan(0);
  });

  it("commands never marked overflow=never stay visible however many commands are added", () => {
    for (const size of sizes) {
      const before = partitionRibbonItems(base, size);
      const after = partitionRibbonItems([...base, ...extra], size);
      const neverIds = [...base, ...extra].filter((entry) => "presentation" in entry && entry.presentation?.overflow === "never").map((entry) => entry.id);
      for (const id of neverIds) expect(after.visible.map((entry) => entry.id), size + ":" + id).toContain(id);
      // Existing commands keep the same placement and relative order after extension.
      for (const entry of base) expect(after.overflow.includes(entry)).toBe(before.overflow.includes(entry));
      expect(after.visible.filter((entry) => base.includes(entry)).map((entry) => entry.id)).toEqual(before.visible.map((entry) => entry.id));
    }
  });
});
