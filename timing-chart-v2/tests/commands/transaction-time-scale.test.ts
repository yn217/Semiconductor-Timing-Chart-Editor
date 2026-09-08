import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CommandId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const id = (value: string) => value as CommandId;

describe("Transaction time scale", () => {
  it("preserves omitted optional and future fields, with exact undo/redo", () => {
    const initialScale = {
      clockCyclesPerTransactionCycle: 2,
      majorInterval: 5,
      minorInterval: 1,
      showSecondaryClock: true,
    };
    const source = { ...canonicalFixture(), transactionTimeScale: initialScale };
    const session = new CommandHistorySession(source);

    expect(session.execute({ id: id("scale_update"), type: "transaction.setTimeScale", scale: { clockCyclesPerTransactionCycle: 4, majorInterval: 8, minorInterval: 2 } }).ok).toBe(true);
    expect(session.getSnapshot().document.transactionTimeScale).toEqual({ ...initialScale, clockCyclesPerTransactionCycle: 4, majorInterval: 8, minorInterval: 2 });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.transactionTimeScale).toEqual(initialScale);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.transactionTimeScale).toEqual({ ...initialScale, clockCyclesPerTransactionCycle: 4, majorInterval: 8, minorInterval: 2 });
  });

  it("supports explicit secondary-clock clearing and rejects semantic no-ops", () => {
    const source = { ...canonicalFixture(), transactionTimeScale: { clockCyclesPerTransactionCycle: 2, majorInterval: 5, minorInterval: 1, showSecondaryClock: true } };
    const session = new CommandHistorySession(source);
    const before = session.getSnapshot();
    expect(session.execute({ id: id("scale_noop"), type: "transaction.setTimeScale", scale: { clockCyclesPerTransactionCycle: 2, majorInterval: 5, minorInterval: 1 } })).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.getSnapshot()).toEqual(before);
    expect(session.execute({ id: id("scale_clear"), type: "transaction.setTimeScale", scale: { clockCyclesPerTransactionCycle: 2, majorInterval: 5, minorInterval: 1 }, clearShowSecondaryClock: true }).ok).toBe(true);
    expect(session.getSnapshot().document.transactionTimeScale).toEqual({ clockCyclesPerTransactionCycle: 2, majorInterval: 5, minorInterval: 1 });
  });
});
