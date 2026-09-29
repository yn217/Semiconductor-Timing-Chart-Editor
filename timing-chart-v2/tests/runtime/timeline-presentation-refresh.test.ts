import { describe, expect, it, vi } from "vitest";
import { refreshRulerAndGridIfNeeded } from "../../apps/editor/src/runtime/timeline-presentation-refresh.js";

describe("Open ruler/grid readiness", () => {
  it("does not rebuild ruler and grid a second time after reference geometry initialized them", () => {
    const refreshRuler = vi.fn();
    const refreshGrid = vi.fn();

    refreshRulerAndGridIfNeeded(() => true, refreshRuler, refreshGrid);

    expect(refreshRuler).not.toHaveBeenCalled();
    expect(refreshGrid).not.toHaveBeenCalled();
  });

  it("initializes ruler and grid together when no reference geometry callback ran", () => {
    const refreshRuler = vi.fn();
    const refreshGrid = vi.fn();

    refreshRulerAndGridIfNeeded(() => false, refreshRuler, refreshGrid);

    expect(refreshRuler).toHaveBeenCalledTimes(1);
    expect(refreshGrid).toHaveBeenCalledTimes(1);
  });
});
