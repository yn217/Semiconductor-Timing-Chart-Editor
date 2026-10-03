import { describe, expect, it } from "vitest";
import { planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CanonicalDocument, CommandId, SignalId } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "../../packages/testing/src/index.js";

const id = (value: string) => value as CommandId;
const bulk = (renames: readonly { signalId: SignalId; name: string }[], commandId = "cmd_bulk_rename"): SemanticCommand => ({ id: id(commandId), type: "signal.bulkRename", renames });

function renameBatchResult(document: CanonicalDocument, renames: readonly { signalId: SignalId; name: string }[]) {
  const session = new CommandHistorySession(document);
  const result = session.executeBatch(id("cmd_batch"), renames.map((rename, index) => ({ id: id(`cmd_rename_${index}`), type: "signal.rename", ...rename })));
  return { result, session };
}

describe("signal.bulkRename", () => {
  const document = generatePerformanceDocument({ signalCount: 40, cycleCount: 8 });
  const [a, b, c] = document.signals;

  it("matches an atomic batch of signal.rename: same document, same change set, one History entry, exact undo/redo", () => {
    const renames = [{ signalId: c!.id, name: "  Gamma  " }, { signalId: a!.id, name: "Alpha" }];
    const session = new CommandHistorySession(document);
    const result = session.execute(bulk(renames));
    const batch = renameBatchResult(document, renames);
    expect(result.ok).toBe(true);
    expect(batch.result.ok).toBe(true);
    expect(session.historyState().undoDepth).toBe(1);
    const after = session.getSnapshot().document;
    expect(after).toEqual(batch.session.getSnapshot().document);
    expect(after.signals[2]!.name).toBe("Gamma");
    expect(after.signals[2]!.display.name).toBe("Gamma");
    expect(after.signals[1]).toEqual(document.signals[1]);
    const plan = planCommand(document, bulk(renames));
    expect(plan.ok && plan.changeSet.rowPresentation).toEqual([c!.id, a!.id]);
    expect(plan.ok && plan.inverseChangeSet.rowPresentation).toEqual([c!.id, a!.id]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.historyState().canUndo).toBe(false);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });

  it("rejects an empty name atomically with the batch's first-failure semantics", () => {
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const result = session.execute(bulk([{ signalId: a!.id, name: "Alpha" }, { signalId: b!.id, name: "   " }]));
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_NAME" }] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState().canUndo).toBe(false);
    expect(renameBatchResult(document, [{ signalId: a!.id, name: "Alpha" }, { signalId: b!.id, name: "   " }]).result).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_NAME" }] });
  });

  it("rejects missing Signals, unchanged names, duplicate IDs and empty input", () => {
    expect(planCommand(document, bulk([{ signalId: "sig_missing" as SignalId, name: "X" }]))).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "SIGNAL_NOT_FOUND" }] });
    expect(planCommand(document, bulk([{ signalId: a!.id, name: "New" }, { signalId: b!.id, name: ` ${b!.name} ` }]))).toMatchObject({ ok: false, reason: "no-op", problems: [{ code: "NO_OP" }] });
    expect(planCommand(document, bulk([{ signalId: a!.id, name: "X" }, { signalId: a!.id, name: "Y" }]))).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "DUPLICATE_ID" }] });
    expect(planCommand(document, bulk([]))).toMatchObject({ ok: false, reason: "no-op" });
  });

  it("plans Find & Replace 'Replace All' in linear work (no per-item signals array copy)", () => {
    const sizes = [5_000, 10_000];
    const copies = sizes.map((signalCount) => {
      const large = generatePerformanceDocument({ signalCount, cycleCount: 8 });
      let copiedElements = 0;
      const command = bulk(large.signals.map((signal) => ({ signalId: signal.id, name: `${signal.name}_R` })));
      // Count whole-array passes over the source signals array (spread copies, forEach/map/findIndex scans).
      const counted = [...large.signals];
      for (const method of [Symbol.iterator, "forEach", "map", "findIndex", "filter", "find"] as const) {
        const original = counted[method] as (...args: unknown[]) => unknown;
        Object.defineProperty(counted, method, { value: function (this: unknown[], ...args: unknown[]) { copiedElements += this.length; return original.apply(this, args); } });
      }
      const plan = planCommand({ ...large, signals: counted }, command);
      expect(plan.ok).toBe(true);
      return copiedElements;
    });
    // Linear: whole-array passes are a small constant, independent of the number of renames.
    expect(copies[0]).toBeLessThanOrEqual(sizes[0]! * 3);
    expect(copies[1]! / copies[0]!).toBeLessThan(2.5);
  });
});
