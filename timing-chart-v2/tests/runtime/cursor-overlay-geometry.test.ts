import { describe, expect, it } from "vitest";
import { cursorOverlayLeftInViewport, resolveCursorCycleAtClientX, resolveCursorOverlayLeftAtCycle } from "../../apps/editor/src/runtime/cursor-overlay-geometry.js";

describe("Cursor overlay shared-geometry placement", () => {
  it("uses content geometry, zoom, and scroll for the viewport-owned Combined axis", () => {
    expect(cursorOverlayLeftInViewport({ contentX: 120, zoom: 1.5, scrollLeft: 40, scrollOwnerLeft: 100, viewportLeft: 100 })).toBe(140);
  });

  it("preserves the nested Cycle scroll owner's plot origin inside its viewport", () => {
    expect(cursorOverlayLeftInViewport({ contentX: 120, zoom: 2, scrollLeft: 40, scrollOwnerLeft: 180, viewportLeft: 100 })).toBe(280);
  });

  it("rejects unusable geometry instead of falling back to ruler DOM ticks", () => {
    expect(cursorOverlayLeftInViewport({ contentX: Number.NaN, zoom: 1, scrollLeft: 0, scrollOwnerLeft: 0, viewportLeft: 0 })).toBeUndefined();
    expect(cursorOverlayLeftInViewport({ contentX: 12, zoom: 0, scrollLeft: 0, scrollOwnerLeft: 0, viewportLeft: 0 })).toBeUndefined();
  });

  it("resolves drag and overlay coordinates through the same runtime geometry for a nested Cycle scroll owner", () => {
    const document = {} as Parameters<typeof resolveCursorOverlayLeftAtCycle>[1];
    const scrollOwner = {
      scrollLeft: 30,
      getBoundingClientRect: () => ({ left: 150 }),
    } as unknown as HTMLDivElement;
    const viewport = {
      dataset: { timeViewportOwner: "cycle-inner" },
      closest: () => null,
      querySelector: () => scrollOwner,
      getBoundingClientRect: () => ({ left: 100 }),
    } as unknown as HTMLDivElement;
    const runtime = {
      sourceBoundaryToLocalX: (_document: unknown, cycle: number) => cycle * 10,
      screenXToSourceCycle: (x: number) => x / 20,
    };

    expect(resolveCursorOverlayLeftAtCycle(runtime, document, 2, 4, viewport)).toBe(100);
    expect(resolveCursorCycleAtClientX(runtime, 220, viewport)).toBe(5);
  });

  it("uses the Combined viewport itself as the shared source-time scroll owner", () => {
    const document = {} as Parameters<typeof resolveCursorOverlayLeftAtCycle>[1];
    const viewport = {
      dataset: {},
      scrollLeft: 45,
      getBoundingClientRect: () => ({ left: 80 }),
    } as unknown as HTMLDivElement;
    const runtime = {
      sourceBoundaryToLocalX: (_document: unknown, cycle: number) => cycle * 12,
      screenXToSourceCycle: (x: number) => x / 12,
    };

    expect(resolveCursorOverlayLeftAtCycle(runtime, document, 1.5, 10, viewport)).toBe(135);
    expect(resolveCursorCycleAtClientX(runtime, 155, viewport)).toBe(10);
  });
});
