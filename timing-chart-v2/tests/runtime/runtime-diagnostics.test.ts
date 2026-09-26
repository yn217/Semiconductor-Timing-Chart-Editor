import { describe, expect, it } from "vitest";
import { createOpenPhaseTracker } from "../../apps/editor/src/runtime/runtime-diagnostics.js";

describe("open phase readiness contract", () => {
  it("publishes readiness stages in order and cycle-view-ready only after the first correct paint", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    const tracker = createOpenPhaseTracker(host);

    tracker.begin(0);
    expect(host.dataset.openReadiness).toBe("opening");
    tracker.mark("canonical-replaced", 1);
    expect(host.dataset.openReadiness).toBe("document-ready");
    tracker.mark("row-shell-painted", 1);
    tracker.mark("reference-geometry-ready", 2);
    expect(host.dataset.cycleViewReady).toBeUndefined();
    tracker.mark("ruler-painted", 3);
    expect(host.dataset.openReadiness).toBe("presentation-ready");
    expect(host.dataset.cycleViewReady).toBe("true");
    tracker.mark("visible-waveforms-ready", 4);
    expect(host.dataset.openReadiness).toBe("visible-waveforms-ready");
    tracker.mark("all-visible-idle", 5);
    expect(host.dataset.openReadiness).toBe("visible-waveforms-ready");
    tracker.mark("diagnostics-ready", 6);
    expect(host.dataset.openReadiness).toBe("idle");

    tracker.begin(7);
    expect(host.dataset.openReadiness).toBe("opening");
    expect(host.dataset.cycleViewReady).toBeUndefined();
  });

  it("defers waveform readiness when rendering finishes before presentation", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    const tracker = createOpenPhaseTracker(host);

    tracker.begin(0);
    tracker.mark("canonical-replaced", 1);
    tracker.mark("visible-waveforms-ready", 2);
    tracker.mark("all-visible-idle", 3);
    tracker.mark("diagnostics-ready", 3.5);
    expect(host.dataset.openReadiness).toBe("document-ready");
    expect(host.dataset.cycleViewReady).toBeUndefined();

    tracker.mark("row-shell-painted", 4);
    tracker.mark("reference-geometry-ready", 5);
    tracker.mark("ruler-painted", 6);
    expect(host.dataset.openReadiness).toBe("idle");
    expect(host.dataset.cycleViewReady).toBe("true");
  });

  it("notifies the diagnostics owner once at presentation readiness", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    let presentationNotifications = 0;
    const tracker = createOpenPhaseTracker(host, () => { presentationNotifications += 1; });

    tracker.begin(0);
    tracker.mark("canonical-replaced", 1);
    tracker.mark("row-shell-painted", 2);
    tracker.mark("reference-geometry-ready", 3);
    tracker.mark("ruler-painted", 4);
    tracker.mark("first-visible-wave-painted", 5);
    tracker.mark("all-visible-idle", 6);
    expect(presentationNotifications).toBe(1);
  });
});
