import { describe, expect, it } from "vitest";
import { generatePerformanceDocument, summarizePerformance, type PerformanceProfile } from "@timing-chart-v2/testing";
import { validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { CommandId, SignalId } from "@timing-chart-v2/schema";
import { CommandHistorySession } from "@timing-chart-v2/history";

describe("Phase 13 performance fixtures and statistics", () => {
  it.each([
    [50, 100], [100, 500], [500, 500], [1000, 1000],
  ] as const)("generates a valid perf_%ix%i fixture", (signalCount, cycleCount) => {
    const document = generatePerformanceDocument({ signalCount, cycleCount });
    expect(document.signals).toHaveLength(signalCount);
    expect(document.timeline.cycleCount).toBe(cycleCount);
    expect(validateCanonicalDocument(document)).toEqual([]);
  });

  it.each(["clock-heavy", "bus-heavy", "annotation-heavy", "transaction-heavy", "mixed"] satisfies readonly PerformanceProfile[])("generates the valid %s profile", (profile) => {
    expect(validateCanonicalDocument(generatePerformanceDocument({ signalCount: 50, cycleCount: 100, profile }))).toEqual([]);
  });

  it("reports deterministic median/p95 instead of a best single run", () => {
    const samples = [1, 8, 3, 2, 5, 4, 6, 7, 9, 10].map((durationMs) => ({ durationMs, rafMs: durationMs + 1, longTasks: durationMs === 10 ? 1 : 0, domNodes: 100 + durationMs }));
    expect(summarizePerformance(samples)).toEqual({ trials: 10, medianMs: 5, p95Ms: 10, medianRafMs: 6, p95RafMs: 11, maxLongTasks: 1, maxDomNodes: 110 });
  });
});

describe("large-document edit history", () => {
  it("retains structural sharing through a long edit/Undo/Redo sequence", () => {
    const session = new CommandHistorySession(generatePerformanceDocument({ signalCount: 1000, cycleCount: 1000 }));
    const unchanged = session.getSnapshot().document.signals[999];
    for (let index = 0; index < 100; index += 1) {
      const result = session.execute({ id: `cmd_perf_rename_${index}` as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: `RENAMED_${index}` });
      expect(result.ok).toBe(true);
      expect(session.getSnapshot().document.signals[999]).toBe(unchanged);
    }
    for (let index = 0; index < 100; index += 1) expect(session.undo().ok).toBe(true);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 100, dirty: false });
    for (let index = 0; index < 100; index += 1) expect(session.redo().ok).toBe(true);
    expect(session.historyMetrics()).toEqual({ commandAttempts: 100, committedActions: 100, undoOperations: 100, redoOperations: 100 });
    expect(session.getSnapshot().document.signals[999]).toBe(unchanged);
  });
});
