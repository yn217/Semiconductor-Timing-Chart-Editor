import { describe, expect, it, vi } from "vitest";
import { canonicalFixture } from "../fixtures/canonical.js";
import { attachEditorEventBindings, resolveTransactionSnapCycle } from "../../apps/editor/src/runtime/interaction-controller.js";
import { scheduleInitialTimelineRefresh } from "../../apps/editor/src/runtime/document-lifecycle-controller.js";
import { createTimelineSurfaceController, type TimelineSurfaceRuntimeInput } from "../../apps/editor/src/runtime/timeline-surface-controller.js";

describe("runtime controller boundaries", () => {
  it("attaches and disposes interaction bindings symmetrically", () => {
    const target = new EventTarget();
    let calls = 0;
    const dispose = attachEditorEventBindings([{ target, type: "runtime-test", listener: () => { calls += 1; } }]);

    target.dispatchEvent(new Event("runtime-test"));
    dispose();
    target.dispatchEvent(new Event("runtime-test"));

    expect(calls).toBe(1);
  });

  it("keeps transaction snap fallback inside the interaction owner", () => {
    const fallback = vi.fn(() => 7);
    const snapIndex = vi.fn();
    const cycle = resolveTransactionSnapCycle({
      clientX: 100,
      host: { querySelector: () => null, dataset: {} } as unknown as HTMLElement,
      projection: { rowLayout: [] } as never,
      timeAxis: { ownerSignalId: undefined } as never,
      screenGeometry: {} as never,
      zoom: 1,
      snapEnabled: true,
      document: canonicalFixture(),
      currentSnapIndex: snapIndex,
      cycleBoundaryAtPointerX: fallback,
      cycleBoundaryAtX: vi.fn(),
      publishState: vi.fn(),
    });

    expect(cycle).toBe(7);
    expect(fallback).toHaveBeenCalledWith(100);
    expect(snapIndex).not.toHaveBeenCalled();
  });

  it("publishes the initial refresh only for the current document lifecycle", async () => {
    const host = { isConnected: true, dataset: {} } as unknown as HTMLElement;
    const refresh = {
      ruler: vi.fn(), range: vi.fn(), playhead: vi.fn(), grid: vi.fn(), zoom: vi.fn(), overlays: vi.fn(), collectErrors: vi.fn(), publish: vi.fn(),
    };

    scheduleInitialTimelineRefresh({ whenIdle: async () => undefined }, host, refresh, { isCurrent: () => true });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(refresh.ruler).toHaveBeenCalledTimes(2);
    expect(refresh.range).toHaveBeenCalledOnce();
    expect(refresh.publish).toHaveBeenCalledOnce();
    expect(host.dataset.editorIdle).toBe("true");
  });

  it("drops an initial refresh for an obsolete document epoch", async () => {
    const host = { isConnected: true, dataset: {} } as unknown as HTMLElement;
    const refresh = { ruler: vi.fn(), range: vi.fn(), playhead: vi.fn(), grid: vi.fn(), zoom: vi.fn(), overlays: vi.fn(), collectErrors: vi.fn(), publish: vi.fn() };

    scheduleInitialTimelineRefresh({ whenIdle: async () => undefined }, host, refresh, { isCurrent: () => false });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(refresh.publish).not.toHaveBeenCalled();
    expect(host.dataset.editorIdle).toBeUndefined();
  });

  it("keeps the timeline mount lifecycle behind a typed non-React owner", () => {
    const nullRef = { current: null };
    const controller = createTimelineSurfaceController({
      dom: { host: nullRef, viewport: nullRef, ruler: nullRef, gridLayer: nullRef, viewportLower: nullRef, rulerLower: nullRef, hostLower: nullRef, gridLayerLower: nullRef, signalSplitRuntimeRef: { current: null } },
      presentation: {
        collapsedGroupIdsRef: { current: new Set() }, applyCollapsedGroupsRef: { current: () => undefined }, forceUpperReprojectRef: { current: () => undefined }, lowerCanvasClickRef: { current: () => undefined }, timelineRuntimeRef: { current: null }, armArrowPick: { current: () => undefined }, snapTransactionCycle: { current: () => undefined }, transactionBoundaryX: { current: () => undefined }, refreshPlayhead: { current: () => undefined }, refreshRangeSelectionBand: { current: () => undefined }, publishStateRef: { current: () => undefined }, timelineRangeRef: { current: { start: 0, end: 1 } }, rangeSelectionActiveRef: { current: false }, selectedCycleRef: { current: 0 }, selectedEdgeRef: { current: undefined }, selectedAnnotationRef: { current: undefined }, gridEnabledRef: { current: false }, snapEnabledRef: { current: false }, treeFocusRowIdRef: { current: undefined }, suppressCanvasClickRef: { current: false }, menuOriginRef: { current: null },
      },
      state: {} as never,
      application: {} as never,
      documentLifecycle: {} as never,
      selection: {} as never,
      editActions: {} as never,
      navigation: {} as never,
      commandRegistry: { current: {} as never },
      executeBatch: (() => undefined) as never,
      viewMetricsOwner: {} as never,
      signalSplitEnabled: false,
      signalSplitRatio: 0.5,
    } as unknown as TimelineSurfaceRuntimeInput);

    expect(controller.mount()).toBeUndefined();
  });
});
