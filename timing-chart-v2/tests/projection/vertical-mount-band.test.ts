import { describe, expect, it } from "vitest";
import { updateVerticalMountBand } from "@timing-chart-v2/projection";

describe("stable vertical row-shell mount band", () => {
  it("keeps the shell band stable during ordinary viewport movement and recenters near its guard", () => {
    const initial = updateVerticalMountBand(undefined, { viewportStartY: 0, viewportEndY: 100 });
    expect(initial).toEqual({ band: { startY: 0, endY: 200, viewportHeight: 100 }, changed: true });

    const withinBand = updateVerticalMountBand(initial.band, { viewportStartY: 40, viewportEndY: 140 });
    expect(withinBand).toEqual({ band: initial.band, changed: false });

    const nearTrailingGuard = updateVerticalMountBand(initial.band, { viewportStartY: 80, viewportEndY: 180 });
    expect(nearTrailingGuard.changed).toBe(true);
    expect(nearTrailingGuard.band).toEqual({ startY: 0, endY: 280, viewportHeight: 100 });
  });

  it("recenters after a large jump or viewport resize", () => {
    const initial = updateVerticalMountBand(undefined, { viewportStartY: 100, viewportEndY: 200 }).band;
    expect(updateVerticalMountBand(initial, { viewportStartY: 2_000, viewportEndY: 2_100 }).changed).toBe(true);
    expect(updateVerticalMountBand(initial, { viewportStartY: 120, viewportEndY: 240 }).changed).toBe(true);
    expect(updateVerticalMountBand(initial, { viewportStartY: 120, viewportEndY: 220 }, true).changed).toBe(true);
  });
});
