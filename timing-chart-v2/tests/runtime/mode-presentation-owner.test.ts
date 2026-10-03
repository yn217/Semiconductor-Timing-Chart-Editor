import { describe, expect, it } from "vitest";
import { createModePresentationOwner } from "../../apps/editor/src/runtime/mode-presentation-owner.js";

describe("mode presentation ownership", () => {
  it("keeps Cycle, Transaction, and Combined zoom/scroll state independent", () => {
    const owner = createModePresentationOwner();
    owner.setZoom("Cycle", 1.25);
    owner.setZoom("Transaction", 1.5);
    owner.setZoom("Split", 2);
    owner.setScrollLeft("Cycle", 120);
    owner.setScrollLeft("Transaction", 340);
    owner.setScrollLeft("Split", 560);

    expect([owner.getZoom("Cycle"), owner.getZoom("Transaction"), owner.getZoom("Split")]).toEqual([1.25, 1.5, 2]);
    expect([owner.getScrollLeft("Cycle"), owner.getScrollLeft("Transaction"), owner.getScrollLeft("Split")]).toEqual([120, 340, 560]);
    owner.resetScrollLeft();
    expect([owner.getScrollLeft("Cycle"), owner.getScrollLeft("Transaction"), owner.getScrollLeft("Split")]).toEqual([0, 0, 0]);
    expect(owner.getZoom("Split")).toBe(2);
  });
});
