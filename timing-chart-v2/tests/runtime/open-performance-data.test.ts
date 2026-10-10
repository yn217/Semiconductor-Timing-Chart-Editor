import { afterEach, describe, expect, it, vi } from "vitest";
import { readOpenPerformanceData } from "../../apps/editor/src/runtime/open-performance-data.js";

afterEach(() => vi.restoreAllMocks());

describe("Open performance data projection", () => {
  it("reports published phase, batch, owner, viewport, and bounded Long Task metrics", () => {
    vi.spyOn(performance, "now").mockReturnValue(10);
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { startTime: 3, duration: 7, entryType: "longtask", name: "task", toJSON: () => ({}) },
      { startTime: 11, duration: 4, entryType: "longtask", name: "later", toJSON: () => ({}) },
    ] as PerformanceEntryList);
    const host = { dataset: {
      openReadiness: "idle",
      openPhaseMarks: JSON.stringify({ "open-command-start": 2 }),
      openPhaseDurations: JSON.stringify({ idle: 90 }),
      openWaveBatchMetrics: JSON.stringify({ batchWallMs: 30 }),
      sessionCounters: JSON.stringify({ viewMetrics: { viewportWidth: 1024 }, mountedWaveOwners: 6 }),
    } } as unknown as HTMLElement;

    const result = JSON.parse(readOpenPerformanceData(host)) as Record<string, unknown>;
    expect(result.openReadiness).toBe("idle");
    expect(result.openTotalWallMs).toBe(90);
    expect(result.openOutsideWaveBatchMs).toBe(60);
    expect(result.viewportWidth).toBe(1024);
    expect(result.mountedWaveOwners).toBe(6);
    expect(result.longTasks).toEqual({ count: 1, maxDurationMs: 7 });
  });

  it("reports the existing not-mounted message when no timeline surface exists", () => {
    expect(readOpenPerformanceData(null)).toBe("Cycle surface is not mounted.");
  });
});
