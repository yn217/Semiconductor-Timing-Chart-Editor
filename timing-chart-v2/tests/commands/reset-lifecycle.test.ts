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
    expect(result).toMatchObject({ ok: false }); expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });
});
