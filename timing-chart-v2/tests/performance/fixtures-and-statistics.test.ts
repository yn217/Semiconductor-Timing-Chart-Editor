import { describe, expect, it } from "vitest";
import { generatePerformanceDocument, summarizePerformance, type PerformanceProfile } from "@timing-chart-v2/testing";
import { validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { CommandId, SignalId } from "@timing-chart-v2/schema";
import { CommandHistorySession, HISTORY_RETENTION_POLICY } from "@timing-chart-v2/history";

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
  it("keeps a 100k-cycle property-order-only replacement a no-op", () => {
    const source = generatePerformanceDocument({ signalCount: 1000, cycleCount: 1000 });
    const large = { ...source, timeline: { ...source.timeline, cycleCount: 100_000, end: 100_000 } };
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, entry]) => [key, reorder(entry)]));
      return value;
    };
    const session = new CommandHistorySession(large);
    const before = session.metrics();
    const started = performance.now();
    const result = session.execute({ id: "cmd_perf_replace_noop" as CommandId, type: "document.replace", document: reorder(large) as ReturnType<typeof generatePerformanceDocument> });
    const elapsedMs = performance.now() - started;
    console.log(`[document-replace-scale] cycles=100000 signals=1000 elapsedMs=${elapsedMs.toFixed(2)} validationRuns=${session.metrics().validationRuns}`);
    expect(result).toMatchObject({ ok: false, reason: "no-op", problems: [{ code: "NO_OP" }] });
    expect(session.metrics()).toEqual(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0, dirty: false });
  });

  it("retains structural sharing through a long edit/Undo/Redo sequence", () => {
    // Structural sharing is independent of document size; 400x400 keeps 300 authoritative validations well inside the default test timeout
    // even on a loaded machine (1000x1000 took ~3.3s alone and timed out at 5s under CPU contention). No timeout is raised.
    const session = new CommandHistorySession(generatePerformanceDocument({ signalCount: 400, cycleCount: 400 }));
    const unchanged = session.getSnapshot().document.signals[399];
    for (let index = 0; index < 100; index += 1) {
      const result = session.execute({ id: `cmd_perf_rename_${index}` as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: `RENAMED_${index}` });
      expect(result.ok).toBe(true);
      expect(session.getSnapshot().document.signals[399]).toBe(unchanged);
    }
    for (let index = 0; index < 100; index += 1) expect(session.undo().ok).toBe(true);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 100, dirty: false });
    for (let index = 0; index < 100; index += 1) expect(session.redo().ok).toBe(true);
    expect(session.historyMetrics()).toEqual({ commandAttempts: 100, committedActions: 100, undoOperations: 100, redoOperations: 100, evictedEntries: 0, retainedEntryCount: 100, retainedSnapshotEstimate: 200 });
    expect(session.getSnapshot().document.signals[399]).toBe(unchanged);
  });

  it("bounds a 10k-action session without changing the current document or cloning for eviction", () => {
    const session = new CommandHistorySession(generatePerformanceDocument({ signalCount: 50, cycleCount: 100 }));
    const initial = session.getSnapshot();
    const untouched = initial.document.signals[49];
    session.markClean();

    for (let index = 0; index < 10_000; index += 1) {
      expect(session.execute({ id: `cmd_retention_rename_${index}` as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: `RETENTION_${index}` }).ok).toBe(true);
    }

    expect(session.historyState()).toMatchObject({
      undoDepth: HISTORY_RETENTION_POLICY.maxEntries,
      redoDepth: 0,
      dirty: true,
    });
    expect(session.historyMetrics()).toMatchObject({
      commandAttempts: 10_000,
      committedActions: 10_000,
      evictedEntries: 9_000,
      retainedEntryCount: HISTORY_RETENTION_POLICY.maxEntries,
      retainedSnapshotEstimate: HISTORY_RETENTION_POLICY.maxEntries * 2,
    });
    expect(session.getSnapshot().document.signals[49]).toBe(untouched);

    for (let index = 0; index < HISTORY_RETENTION_POLICY.maxEntries; index += 1) expect(session.undo().ok).toBe(true);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: HISTORY_RETENTION_POLICY.maxEntries, dirty: true });
    expect(session.undo()).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_perf_1")?.name).toBe("RETENTION_9000");

    expect(session.execute({ id: "cmd_retention_branch" as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: "BRANCHED" }).ok).toBe(true);
    expect(session.historyState()).toMatchObject({ canRedo: false, redoDepth: 0, dirty: true });
    expect(session.historyMetrics()).toMatchObject({ retainedEntryCount: 2, retainedSnapshotEstimate: 4 });
  }, 30_000);
});
