import { describe, expect, it, vi } from "vitest";
import { DefaultScreenGeometryProjector } from "@timing-chart-v2/geometry";
import { canonicalFixture } from "../fixtures/canonical.js";
import { resolveTransactionSnapCycle } from "../../apps/editor/src/runtime/interaction-controller.js";

describe("Transaction drag screen-to-source conversion", () => {
  it("adds the current shared viewport scroll before resolving local geometry", () => {
    const resolveLocal = vi.fn((localX: number) => Math.round(localX));
    const cycle = resolveTransactionSnapCycle({
      clientX: 300,
      surfaceLeft: 100,
      horizontalScroll: 400,
      snapAxisRowY: undefined,
      timeAxisMetrics: { timeAxis: { ownerSignalId: undefined }, zoom: 2 } as never,
      screenGeometry: new DefaultScreenGeometryProjector(),
      snapEnabled: true,
      document: canonicalFixture(),
      currentSnapIndex: () => { throw new Error("no axis owner should query SnapIndex"); },
      cycleBoundaryAtPointerX: vi.fn(),
      cycleBoundaryAtX: vi.fn(),
      cycleBoundaryAtLocalX: resolveLocal,
    });

    // localX = (clientX - viewportLeft) / zoom + scrollLeft / zoom
    expect(resolveLocal).toHaveBeenCalledWith(300, 2, true);
    expect(cycle).toBe(300);
  });
});
