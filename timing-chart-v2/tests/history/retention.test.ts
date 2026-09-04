import { describe, expect, it } from "vitest";
import { CommandHistorySession, HISTORY_RETENTION_LIMIT } from "@timing-chart-v2/history";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import type { CommandId, SignalId } from "@timing-chart-v2/schema";

// #275: history retention must be bounded by an explicit action-count
// horizon, without resorting to whole-document serialization/deep-clone
// to enforce it, and without breaking Dirty/current-document correctness
// once the clean snapshot has fallen off the retained Undo horizon.
describe("CommandHistorySession retention", () => {
  it("bounds Undo depth for a 10k-action session without deep-cloning or serializing the document to enforce it", () => {
    const session = new CommandHistorySession(generatePerformanceDocument({ signalCount: 10, cycleCount: 10 }));
    const unrelatedSignal = session.getSnapshot().document.signals[9];
    const actionCount = 10_000;
    for (let index = 0; index < actionCount; index += 1) {
      const result = session.execute({ id: `cmd_retention_${index}` as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: `RENAMED_${index}` });
      expect(result.ok).toBe(true);
    }
    // Bounded: retained Undo depth never exceeds the configured horizon,
    // even after 10x that many actions.
    const state = session.historyState();
    expect(state.undoDepth).toBe(HISTORY_RETENTION_LIMIT);
    expect(state.canRedo).toBe(false);
    // Structural sharing intact: an unrelated signal reference is still
    // the exact same object after 10k commits -- proving retention/
    // eviction never deep-cloned or otherwise touched the document to
    // enforce the horizon.
    expect(session.getSnapshot().document.signals[9]).toBe(unrelatedSignal);
    expect(session.getSnapshot().document.signals[1].name).toBe(`RENAMED_${actionCount - 1}`);
  });

  it("keeps Dirty correct once the clean snapshot has fallen off the retained Undo horizon", () => {
    const session = new CommandHistorySession(generatePerformanceDocument({ signalCount: 10, cycleCount: 10 }));
    session.markClean();
    expect(session.historyState().dirty).toBe(false);
    // Push well past the retention horizon -- the clean snapshot's own
    // history entry (if it ever had one) is long evicted from #undo.
    for (let index = 0; index < HISTORY_RETENTION_LIMIT + 50; index += 1) {
      const result = session.execute({ id: `cmd_dirty_${index}` as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: `RENAMED_${index}` });
      expect(result.ok).toBe(true);
    }
    expect(session.historyState().dirty).toBe(true);
    session.markClean();
    expect(session.historyState().dirty).toBe(false);
    // Undo/Redo keep working correctly within the still-retained window --
    // eviction of older entries doesn't corrupt the remaining chain.
    const beforeUndo = session.getSnapshot().document.signals[1].name;
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals[1].name).not.toBe(beforeUndo);
    expect(session.historyState().dirty).toBe(true);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.signals[1].name).toBe(beforeUndo);
    expect(session.historyState().dirty).toBe(false);
  });

  it("does not force the historical chain to remain reachable forever after markClean", () => {
    const session = new CommandHistorySession(generatePerformanceDocument({ signalCount: 10, cycleCount: 10 }));
    for (let index = 0; index < 5; index += 1) {
      expect(session.execute({ id: `cmd_reach_${index}` as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: `RENAMED_${index}` }).ok).toBe(true);
    }
    session.markClean();
    const currentDocument = session.getSnapshot().document;
    for (let index = 0; index < HISTORY_RETENTION_LIMIT + 5; index += 1) {
      expect(session.execute({ id: `cmd_reach2_${index}` as CommandId, type: "signal.rename", signalId: "sig_perf_1" as SignalId, name: `RENAMED2_${index}` }).ok).toBe(true);
    }
    // Current document identity/content is unaffected by how much of the
    // older chain remains reachable through #undo.
    expect(session.getSnapshot().document).not.toBe(currentDocument);
    expect(session.getSnapshot().document.signals[1].name).toBe("RENAMED2_1004");
    expect(session.historyState().undoDepth).toBe(HISTORY_RETENTION_LIMIT);
  });
});
