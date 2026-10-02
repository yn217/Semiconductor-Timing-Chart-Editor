import { describe, expect, it, vi } from "vitest";
import { canonicalFixture } from "../fixtures/canonical.js";
import { attachEditorEventBindings, resolveTransactionSnapCycle } from "../../apps/editor/src/runtime/interaction-controller.js";
import { scheduleInitialTimelineRefresh } from "../../apps/editor/src/runtime/document-lifecycle-controller.js";
import { createSignalSplitSurfaceController } from "../../apps/editor/src/runtime/signal-split-surface-controller.js";
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
      timeAxisMetrics: { timeAxis: { ownerSignalId: undefined }, zoom: 1 } as never,
      screenGeometry: {} as never,
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

  it("resolves Transaction-only boundaries from semantic local geometry", () => {
    const local = vi.fn(() => 11);
    const cycleDomFallback = vi.fn(() => 3);
    const pointerFallback = vi.fn(() => 4);
    const screenGeometry = { fromScreen: vi.fn(() => ({ x: 42, y: 0 })) } as never;
    const cycle = resolveTransactionSnapCycle({
      clientX: 100,
      surfaceLeft: 58,
      host: {} as HTMLElement,
      projection: { rowLayout: [] } as never,
      timeAxisMetrics: { timeAxis: { ownerSignalId: undefined }, zoom: 2 } as never,
      screenGeometry,
      snapEnabled: true,
      document: canonicalFixture(),
      currentSnapIndex: vi.fn(),
      cycleBoundaryAtPointerX: pointerFallback,
      cycleBoundaryAtX: cycleDomFallback,
      cycleBoundaryAtLocalX: (localX, _snapEnabled) => local(localX),
      publishState: vi.fn(),
    });

    expect(cycle).toBe(11);
    expect(local).toHaveBeenCalledWith(42);
    expect(cycleDomFallback).not.toHaveBeenCalled();
    expect(pointerFallback).not.toHaveBeenCalled();
  });

  it("publishes the initial refresh only for the current document lifecycle", async () => {
    const host = { isConnected: true, dataset: {} } as unknown as HTMLElement;
    const order: string[] = [];
    const refresh = {
      ruler: vi.fn(() => { order.push("ruler"); }), range: vi.fn(), playhead: vi.fn(), grid: vi.fn(), zoom: vi.fn(), overlays: vi.fn(),
      collectErrors: vi.fn(() => { order.push("collect-errors"); }), publish: vi.fn(() => { order.push("publish"); }),
      onPresentationReady: vi.fn(() => { order.push("presentation-ready"); }),
    };

    scheduleInitialTimelineRefresh({ whenIdle: async () => undefined }, host, refresh, { isCurrent: () => true });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(refresh.ruler).toHaveBeenCalledTimes(2);
    expect(refresh.range).toHaveBeenCalledOnce();
    expect(refresh.publish).toHaveBeenCalledOnce();
    // editorIdle is owned by the staged readiness model; the initial refresh publishes the view-ready flag.
    expect(host.dataset.cycleViewReady).toBe("true");
    expect(order.indexOf("presentation-ready")).toBeLessThan(order.indexOf("collect-errors"));
    expect(order.indexOf("presentation-ready")).toBeLessThan(order.indexOf("publish"));
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

  it("keeps the signal-split lifecycle behind a non-React owner", () => {
    const dispose = vi.fn();
    const setPane = vi.fn();
    const forceUpperReproject = vi.fn();
    const controller = createSignalSplitSurfaceController({
      application: { runtime: { projection: { setPane }, session: {} } } as never,
      dom: {
        host: { current: null }, viewport: { current: null }, ruler: { current: null }, gridLayer: { current: null },
        viewportLower: { current: null }, rulerLower: { current: null }, hostLower: { current: null }, gridLayerLower: { current: null },
        signalSplitRuntimeRef: { current: { dispose } },
      },
      presentation: {
        collapsedGroupIdsRef: { current: new Set() }, applyCollapsedGroupsRef: { current: () => undefined }, forceUpperReprojectRef: { current: forceUpperReproject }, lowerCanvasClickRef: { current: () => undefined }, timelineRuntimeRef: { current: null }, armArrowPick: { current: () => undefined }, snapTransactionCycle: { current: () => undefined }, transactionBoundaryX: { current: () => undefined }, refreshPlayhead: { current: () => undefined }, refreshRangeSelectionBand: { current: () => undefined }, publishStateRef: { current: () => undefined }, timelineRangeRef: { current: { start: 0, end: 1 } }, rangeSelectionActiveRef: { current: false }, selectedCycleRef: { current: 0 }, selectedEdgeRef: { current: undefined }, selectedAnnotationRef: { current: undefined }, gridEnabledRef: { current: false }, snapEnabledRef: { current: false }, treeFocusRowIdRef: { current: undefined }, suppressCanvasClickRef: { current: false }, menuOriginRef: { current: null },
      },
      signalSplitEnabled: false,
    } as unknown as TimelineSurfaceRuntimeInput);

    expect(controller.mount()).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
    expect(setPane).toHaveBeenCalledWith(undefined);
    expect(forceUpperReproject).toHaveBeenCalledOnce();
  });
});
