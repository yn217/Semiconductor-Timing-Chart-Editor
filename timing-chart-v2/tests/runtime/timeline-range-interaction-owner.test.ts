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
        ruler: { querySelectorAll: () => [] } as unknown as HTMLElement,
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
});
