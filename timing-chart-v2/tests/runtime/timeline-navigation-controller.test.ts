import { describe, expect, it, vi } from "vitest";
import { createTimelineNavigationController } from "../../apps/editor/src/runtime/use-editor-runtime-bridge.js";

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
});
