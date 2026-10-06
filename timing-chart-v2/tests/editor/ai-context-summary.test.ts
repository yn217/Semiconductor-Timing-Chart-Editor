import { describe, expect, it } from "vitest";
import { buildAIContextSummary } from "../../apps/editor/src/ai-context-summary.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("AI context summary", () => {
  it("resolves current stable selections, view, range, and scope from the live document", () => {
    const document = canonicalFixture();
    const summary = buildAIContextSummary({
      document,
      mode: "Cycle",
      scope: "selection",
      selectedSignalId: document.signals[1]!.id,
      selectedGroupId: document.signalGroups[0]!.id,
      selectedAnnotationId: "stale-annotation",
      selectedTransactionId: "stale-transaction",
      range: { start: 2, end: 7 },
    });
    expect(summary).toEqual({ document: "Phase 1 fixture", view: "Cycle", selection: "Signal: DATA · Group: Main", range: "2–7 cycles", scope: "Selection" });
  });

  it("does not present stale entity IDs as current context and marks hidden selected entities", () => {
    const source = canonicalFixture();
    const document = {
      ...source,
      signals: source.signals.map((signal) => signal.id === source.signals[1]!.id ? { ...signal, display: { ...signal.display, visible: false } } : signal),
    };
    const summary = buildAIContextSummary({
      document,
      mode: "Combined",
      scope: "current-view",
      selectedSignalId: source.signals[1]!.id,
      selectedGroupId: "stale-group" as typeof source.signalGroups[number]["id"],
      selectedAnnotationId: "stale-annotation",
      selectedTransactionId: "stale-transaction",
      range: undefined,
    });
    expect(summary).toMatchObject({ view: "Combined", selection: "Signal: DATA (hidden)", range: "None", scope: "Current View" });
  });
});
