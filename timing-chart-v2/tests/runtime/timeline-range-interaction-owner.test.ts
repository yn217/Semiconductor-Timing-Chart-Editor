import { describe, expect, it } from "vitest";
import { TimelineRangeInteractionOwner, type TimelineRangeInteractionContext } from "../../apps/editor/src/runtime/timeline-range-interaction-owner.js";

describe("TimelineRangeInteractionOwner", () => {
  it("refreshes range preview and playhead from the same pointer cycle", () => {
    const originalElement = globalThis.Element;
    globalThis.Element = class {} as unknown as typeof Element;
    try {
      const host = { dataset: {} as Record<string, string>, setPointerCapture: () => undefined } as unknown as HTMLElement;
      const refreshes: string[] = [];
      const context: TimelineRangeInteractionContext = {
        rendererHost: host,
        isTimeDomainPointerTarget: () => true,
        cycleBoundaryAtX: (clientX) => clientX === 20 ? 6 : 2,
        getCycleCount: () => 24,
        getRange: () => ({ start: 2, end: 4 }),
        getSelectedCycle: () => 2,
        setSelectedCyclePreview: (cycle) => { refreshes.push(`preview:${cycle}`); },
        setRangeSelectionActive: () => undefined,
        setRange: () => undefined,
        setSelectedCycle: () => undefined,
        applyCanvasCycleSelection: () => undefined,
        refreshRange: () => { refreshes.push(`range:${host.dataset.rangePreviewCycle}`); },
        refreshPlayhead: () => { refreshes.push(`playhead:${host.dataset.rangePreviewCycle}`); },
      };
      const owner = new TimelineRangeInteractionOwner(context);
      owner.pointerDown({ button: 0, clientX: 10, pointerId: 1, target: undefined, currentTarget: host, preventDefault: () => undefined } as unknown as PointerEvent);
      owner.pointerMove({ clientX: 20, pointerId: 1, preventDefault: () => undefined } as unknown as PointerEvent);

      expect(host.dataset.rangePreview).toBe("2:6");
      expect(refreshes).toEqual(["preview:6", "range:6", "playhead:6"]);
    } finally {
      globalThis.Element = originalElement;
    }
  });

  it("keeps a Ruler tick's semantic cycle for a click after pointer capture", () => {
    const originalElement = globalThis.Element;
    const originalRequestAnimationFrame = (globalThis as unknown as { requestAnimationFrame?: (callback: () => void) => number }).requestAnimationFrame;
    class FakeElement {
      readonly dataset: Record<string, string> = { sourceCycle: "24", cycle: "24" };
      closest(selector: string): FakeElement | null {
        return selector === "[data-testid='cycle-ruler']" || selector === "[data-cycle]" ? this : null;
      }
    }
    globalThis.Element = FakeElement as unknown as typeof Element;
    (globalThis as unknown as { requestAnimationFrame: (callback: () => void) => number }).requestAnimationFrame = (callback) => { callback(); return 0; };
    try {
      const host = { dataset: {} as Record<string, string>, setPointerCapture: () => undefined } as unknown as HTMLElement;
      const selected: number[] = [];
      const context: TimelineRangeInteractionContext = {
        rendererHost: host,
        isTimeDomainPointerTarget: () => true,
        cycleBoundaryAtX: () => 11,
        getCycleCount: () => 24,
        getRange: () => ({ start: 2, end: 4 }),
        getSelectedCycle: () => 2,
        setSelectedCyclePreview: () => undefined,
        setRangeSelectionActive: () => undefined,
        setRange: () => undefined,
        setSelectedCycle: () => undefined,
        applyCanvasCycleSelection: (cycle) => { selected.push(cycle); },
        refreshRange: () => undefined,
        refreshPlayhead: () => undefined,
      };
      const owner = new TimelineRangeInteractionOwner(context);
      const tick = new FakeElement();
      owner.pointerDown({ button: 0, clientX: 200, pointerId: 1, target: tick, currentTarget: host, preventDefault: () => undefined } as unknown as PointerEvent);
      owner.pointerUp({ clientX: 200, pointerId: 1, target: host, currentTarget: host, preventDefault: () => undefined } as unknown as PointerEvent);

      expect(selected).toEqual([24]);
    } finally {
      globalThis.Element = originalElement;
      if (originalRequestAnimationFrame === undefined) delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      else (globalThis as unknown as { requestAnimationFrame: (callback: () => void) => number }).requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("cancels an active range gesture without committing it", () => {
    const originalElement = globalThis.Element;
    const originalRequestAnimationFrame = (globalThis as unknown as { requestAnimationFrame?: (callback: () => void) => number }).requestAnimationFrame;
    globalThis.Element = class {} as unknown as typeof Element;
    (globalThis as unknown as { requestAnimationFrame: (callback: () => void) => number }).requestAnimationFrame = (callback) => { callback(); return 0; };
    try {
      const host = { dataset: {} as Record<string, string>, setPointerCapture: () => undefined } as unknown as HTMLElement;
      const context: TimelineRangeInteractionContext = {
        rendererHost: host,
        isTimeDomainPointerTarget: () => true,
        cycleBoundaryAtX: (clientX) => clientX === 20 ? 6 : 2,
        getCycleCount: () => 24,
        getRange: () => ({ start: 2, end: 4 }),
        getSelectedCycle: () => 2,
        setSelectedCyclePreview: () => undefined,
        setRangeSelectionActive: () => undefined,
        setRange: () => { throw new Error("cancel must not commit a range"); },
        setSelectedCycle: () => { throw new Error("cancel must not commit a cycle"); },
        applyCanvasCycleSelection: () => { throw new Error("cancel must not select a cycle"); },
        refreshRange: () => undefined,
        refreshPlayhead: () => undefined,
      };
      const owner = new TimelineRangeInteractionOwner(context);
      owner.pointerDown({ button: 0, clientX: 10, pointerId: 1, target: undefined, currentTarget: host, preventDefault: () => undefined } as unknown as PointerEvent);
      owner.pointerMove({ clientX: 20, pointerId: 1, preventDefault: () => undefined } as unknown as PointerEvent);
      owner.cancel();

      expect(host.dataset.rangeDrag).toBeUndefined();
      expect(host.dataset.rangePreview).toBeUndefined();
      expect(host.dataset.rangePreviewCycle).toBeUndefined();
    } finally {
      globalThis.Element = originalElement;
      if (originalRequestAnimationFrame === undefined) delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      else (globalThis as unknown as { requestAnimationFrame: (callback: () => void) => number }).requestAnimationFrame = originalRequestAnimationFrame;
    }
  });
});
