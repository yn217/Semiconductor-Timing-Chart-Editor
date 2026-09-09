import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { parseDocument, serializeValidatedCanonicalDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (value: string) => value as never;

describe("Reset semantic lifecycle", () => {
  it("round-trips and restores exact metadata through undo/redo", () => {
    const source = canonicalFixture(); const session = new CommandHistorySession(source);
    const reset = { polarity: "active-low", synchronization: "asynchronous", assertCycle: 1, deassertCycle: 6 } as const;
    expect(session.execute({ id: commandId("reset_set"), type: "signal.updateResetSemantics", signalId: "sig_data", resetSemantics: reset }).ok).toBe(true);
    expect(session.getSnapshot().document.signals[1]).toHaveProperty("resetSemantics", reset);
    expect(session.undo().ok).toBe(true); expect(session.getSnapshot().document.signals[1]).not.toHaveProperty("resetSemantics");
    expect(session.redo().ok).toBe(true); expect(session.getSnapshot().document.signals[1]).toHaveProperty("resetSemantics", reset);
    const reopened = parseDocument(serializeValidatedCanonicalDocument(session.getSnapshot().document));
    expect(reopened.ok).toBe(true); if (reopened.ok) expect(reopened.document.signals[1]).toHaveProperty("resetSemantics", reset);
  });
  it("rejects invalid metadata without history or dirty changes", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const result = session.execute({ id: commandId("reset_bad"), type: "signal.updateResetSemantics", signalId: "sig_data", resetSemantics: { polarity: "bad" as never, synchronization: "synchronous" } });
    expect(result).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "INVALID_RESET_SEMANTICS" })] }); expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });
  it("rejects invalid clock timing atomically and preserves reset metadata across role changes", () => {
    const source = canonicalFixture(); const session = new CommandHistorySession(source);
    const bad = session.execute({ id: commandId("clock_bad"), type: "signal.updateClockGenerator", signalId: "sig_clk", generator: { ...source.signals[0]!.type === "clock" ? source.signals[0]!.generator : { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, period: 0 } });
    expect(bad).toMatchObject({ ok: false }); expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
    const withReset = { ...source, signals: source.signals.map((signal) => signal.id === "sig_data" ? { ...signal, resetSemantics: { polarity: "active-low", synchronization: "synchronous" } as const } : signal) };
    const roleSession = new CommandHistorySession(withReset);
    expect(roleSession.execute({ id: commandId("role_change"), type: "signal.updateProperties", signalId: "sig_data", name: "DATA", role: "output" }).ok).toBe(true);
    expect(roleSession.getSnapshot().document.signals[1]).toHaveProperty("resetSemantics.polarity", "active-low");
  });

  it("transforms Reset source-time metadata with timeline insert and delete", () => {
    const source = { ...canonicalFixture(), signals: canonicalFixture().signals.map((signal) => signal.id === "sig_data" ? { ...signal, resetSemantics: { polarity: "active-low", synchronization: "synchronous", assertCycle: 1, deassertCycle: 6 } as const } : signal) };
    const session = new CommandHistorySession(source);
    expect(session.execute({ id: commandId("reset_insert"), type: "timeline.insert", at: 2, count: 2 }).ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")).toHaveProperty("resetSemantics.deassertCycle", 8);
    expect(session.execute({ id: commandId("reset_delete"), type: "timeline.delete", start: 2, end: 4 }).ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")).toHaveProperty("resetSemantics.deassertCycle", 6);
  });
});
