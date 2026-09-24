import { describe, expect, it, vi } from "vitest";
import { createTimelineNavigationController } from "../../apps/editor/src/runtime/viewport-controller.js";

function documentFixture() {
  return { timeline: { cycleCount: 24 } } as never;
}

describe("createTimelineNavigationController", () => {
  it("does not fall back to cycle zero when Fit Selection geometry is unavailable", () => {
    const fitSelection = vi.fn();
    const host = { dataset: {} } as unknown as HTMLElement;
    const navigation = createTimelineNavigationController({
      runtime: { sourceBoundaryToLocalX: () => undefined, fitSelection, fitAll: vi.fn(), navigateToCycle: vi.fn() },
      getDocument: documentFixture,
      getRange: () => ({ start: 8, end: 9 }),
      setSelectedCycle: vi.fn(),
      setRange: vi.fn(),
      host,
      publishState: vi.fn(),
    });

    navigation.fitSelection();

    expect(fitSelection).not.toHaveBeenCalled();
    expect(host.dataset.timelineNavigationDiagnostic).toBe("fit-selection-geometry-unavailable");
  });

  it("passes the selected source boundaries to the viewport runtime", () => {
    const fitSelection = vi.fn();
    const navigation = createTimelineNavigationController({
      runtime: { sourceBoundaryToLocalX: (_document, cycle) => cycle * 10, fitSelection, fitAll: vi.fn(), navigateToCycle: vi.fn() },
      getDocument: documentFixture,
      getRange: () => ({ start: 8, end: 9 }),
      setSelectedCycle: vi.fn(),
      setRange: vi.fn(),
      host: { dataset: {} } as unknown as HTMLElement,
      publishState: vi.fn(),
    });

    navigation.fitSelection();

    expect(fitSelection).toHaveBeenCalledWith(80, 90);
  });

  it("fits an explicit source-cycle interval through shared source-boundary geometry", () => {
    const fitSelection = vi.fn();
    const navigation = createTimelineNavigationController({
      runtime: { sourceBoundaryToLocalX: (_document, cycle) => cycle * 10, fitSelection, fitAll: vi.fn(), navigateToCycle: vi.fn() },
      getDocument: documentFixture,
      getRange: () => ({ start: 0, end: 1 }),
      setSelectedCycle: vi.fn(),
      setRange: vi.fn(),
      host: { dataset: {} } as unknown as HTMLElement,
      publishState: vi.fn(),
    });

    navigation.fitSourceRange(3, 11);

    expect(fitSelection).toHaveBeenCalledOnce();
    expect(fitSelection).toHaveBeenCalledWith(30, 110);
  });

  it("rejects invalid source ranges and reports unavailable shared geometry", () => {
    const fitSelection = vi.fn();
    const host = { dataset: {} } as unknown as HTMLElement;
    const navigation = createTimelineNavigationController({
      runtime: { sourceBoundaryToLocalX: () => undefined, fitSelection, fitAll: vi.fn(), navigateToCycle: vi.fn() },
      getDocument: documentFixture,
      getRange: () => ({ start: 0, end: 1 }),
      setSelectedCycle: vi.fn(),
      setRange: vi.fn(),
      host,
      publishState: vi.fn(),
    });

    navigation.fitSourceRange(3, 11);
    navigation.fitSourceRange(11, 3);

    expect(fitSelection).not.toHaveBeenCalled();
    expect(host.dataset.timelineNavigationDiagnostic).toBe("fit-source-range-geometry-unavailable");
  });
});
