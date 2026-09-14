import { describe, expect, it } from "vitest";
import { createOpenPhaseTracker } from "../../apps/editor/src/runtime/runtime-diagnostics.js";

describe("open phase readiness contract", () => {
  it("publishes cycle-view-ready only after the first correct paint", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    const tracker = createOpenPhaseTracker(host);

    tracker.begin(0);
    tracker.mark("row-shell-painted", 1);
    tracker.mark("reference-geometry-ready", 2);
    expect(host.dataset.cycleViewReady).toBeUndefined();
    tracker.mark("ruler-painted", 3);
    expect(host.dataset.cycleViewReady).toBe("true");

    tracker.begin(4);
    expect(host.dataset.cycleViewReady).toBeUndefined();
  });
});
