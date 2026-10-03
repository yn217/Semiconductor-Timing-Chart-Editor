import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { AnnotationId, CommandId, Signal, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

/**
 * #864 (PR #1022 independent check): deleting the 10,000-Signal product limit is one atomic command with exact Undo/Redo; a dependent in
 * the LAST Signal rejects the whole batch with no partial mutation and no History entry. (The earlier "History did not grow" observation
 * was the dependent-Annotation fixture, not a size limit.)
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const signalsOf = (count: number): Signal[] => Array.from({ length: count }, (_, index) => { const base = clone(canonicalFixture().signals[1]!); return { ...base, id: `sig_lim_${index}` as SignalId, name: `S${index}`, source: { ...base.source, signalName: `S${index}` }, display: { ...base.display, name: `S${index}` } } as Signal; });
const documentOf = (signals: Signal[], extra: Record<string, unknown> = {}) => {
  const source = canonicalFixture();
  const { referenceClock: _referenceClock, ...timeline } = source.timeline;
  return { ...source, timeline, signals, signalGroups: [{ ...source.signalGroups[0]!, rows: signals.map((signal) => signal.id) }], annotations: [], transactions: [], ...extra };
};

describe("signal.bulkDelete at the 10,000 Signal limit", () => {
  it("is one History entry and Undo/Redo restore exact documents", () => {
    const document = documentOf(signalsOf(10_000));
    const session = new CommandHistorySession(document);
    expect(session.execute({ id: "cmd_del_all" as CommandId, type: "signal.bulkDelete", signalIds: document.signals.map((signal) => signal.id) }).ok).toBe(true);
    expect(session.getSnapshot().document.signals).toHaveLength(0);
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.signals).toHaveLength(0);
    expect(session.historyState()).toMatchObject({ undoDepth: 1 });
  });

  it("rejects the whole batch when the LAST Signal has a dependent (no partial delete, no History)", () => {
    const signals = signalsOf(10_000);
    const document = documentOf(signals, { annotations: [{ id: "ann_last" as AnnotationId, type: "marker", label: "dep", visible: true, anchor: { signalId: signals.at(-1)!.id, cycle: 1, point: "cycle-start" } }] });
    const session = new CommandHistorySession(document);
    const result = session.execute({ id: "cmd_del_dep" as CommandId, type: "signal.bulkDelete", signalIds: signals.map((signal) => signal.id) });
    expect(result).toMatchObject({ ok: false, problems: [{ code: "SIGNAL_HAS_DEPENDENTS" }] });
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });
});
