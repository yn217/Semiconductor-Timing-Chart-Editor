import { describe, expect, it, vi } from "vitest";
import { WaveRenderScheduler } from "../../apps/editor/src/runtime/wave-render-scheduler.js";

describe("WaveRenderScheduler", () => {
  it("orders by priority, skips stale work, and keeps a job failure local", async () => {
    const scheduler = new WaveRenderScheduler();
    const runOrder: string[] = [];
    const results = await scheduler.runBatch([
      { key: "low", priority: 0, isCurrent: () => true, run: () => { runOrder.push("low"); return "LOW"; } },
      { key: "stale", priority: 5, isCurrent: () => false, run: () => { runOrder.push("stale"); return "STALE"; } },
      { key: "reference", priority: 10, isCurrent: () => true, run: () => { runOrder.push("reference"); return "REFERENCE"; } },
      { key: "failure", priority: 5, isCurrent: () => true, run: () => { runOrder.push("failure"); throw new Error("signal-local"); } },
    ], {
      budgetMs: 100,
      now: () => 0,
      shouldYield: () => false,
      yieldToNextTask: vi.fn(async () => undefined),
    });

    expect(runOrder).toEqual(["reference", "failure", "low"]);
    expect(results).toEqual([
      { key: "reference", status: "completed", value: "REFERENCE" },
      { key: "stale", status: "stale-before-run" },
      { key: "failure", status: "error", error: expect.any(Error) },
      { key: "low", status: "completed", value: "LOW" },
    ]);
  });

  it("retains a completed value when the job becomes stale after its work ran", async () => {
    const scheduler = new WaveRenderScheduler();
    let current = true;
    const results = await scheduler.runBatch([{
      key: "owner",
      priority: 0,
      isCurrent: () => current,
      run: () => { current = false; return { markupBytes: 123 }; },
    }], {
      budgetMs: 100,
      now: () => 0,
      shouldYield: () => false,
      yieldToNextTask: vi.fn(async () => undefined),
    });

    expect(results).toEqual([{ key: "owner", status: "stale-after-run", value: { markupBytes: 123 } }]);
  });

  it("yields between over-budget jobs but never after the final job", async () => {
    const scheduler = new WaveRenderScheduler();
    const yieldToNextTask = vi.fn(async () => { now += 3; });
    const onYield = vi.fn();
    let now = 0;
    const results = await scheduler.runBatch([0, 1, 2].map((key) => ({
      key,
      priority: 0,
      isCurrent: () => true,
      run: () => { now += 10; return key; },
    })), {
      budgetMs: 16,
      initialSliceStartedAt: 0,
      now: () => now,
      shouldYield: () => true,
      yieldToNextTask,
      onYield,
    });

    expect(results.map((result) => result.status)).toEqual(["completed", "completed", "completed"]);
    expect(yieldToNextTask).toHaveBeenCalledTimes(1);
    expect(onYield).toHaveBeenCalledTimes(1);
  });
});
