import { describe, expect, it } from "vitest";
import { fixedColumnsOutsideTimeline, timelineScrollOwner } from "../../apps/editor/src/runtime/timeline-scroll-owner.js";

describe("ModeWorkspace horizontal owner contract", () => {
  it("resolves Cycle and Combined to their nested timeline owner and Transaction to its declared viewport", () => {
    const nested = { id: "cycle-inner-owner" } as unknown as HTMLElement;
    const cycle = {
      dataset: { timeViewportOwner: "cycle-inner" },
      closest: () => ({}),
      querySelector: (selector: string) => selector.includes("timeline-viewport") ? nested : null,
    } as unknown as HTMLElement;
    const transaction = { dataset: { timeViewportOwner: "transaction-viewport" }, closest: () => ({}) } as unknown as HTMLElement;
    const combined = { dataset: { timeViewportOwner: "combined-inner" }, closest: () => ({}), querySelector: (selector: string) => selector.includes("timeline-viewport") ? nested : null } as unknown as HTMLElement;

    expect(timelineScrollOwner(cycle)).toBe(nested);
    expect(fixedColumnsOutsideTimeline(cycle)).toBe(true);
    expect(timelineScrollOwner(transaction)).toBe(transaction);
    expect(fixedColumnsOutsideTimeline(transaction)).toBe(false);
    expect(timelineScrollOwner(combined)).toBe(nested);
    expect(fixedColumnsOutsideTimeline(combined)).toBe(true);
  });

  it("keeps non-DOM viewport owners self-contained", () => {
    const standIn = { dataset: {}, querySelector: () => null } as unknown as HTMLElement;
    expect(timelineScrollOwner(standIn)).toBe(standIn);
  });
});
