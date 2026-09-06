import { describe, expect, it } from "vitest";
import { validateCanonicalDocument, type AnnotationId, type SignalId } from "@timing-chart-v2/schema";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CommandId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Highlight semantic position mode", () => {
  it("accepts fractional Free time and rejects fractional Cycle Snap", () => {
    const base = canonicalFixture();
    const highlight = { id: "highlight_mode" as AnnotationId, type: "highlight" as const, label: "H", visible: true, start: { signalId: "sig_clk" as SignalId, cycle: 1.5, point: "cycle-start" as const }, end: { signalId: "sig_clk" as SignalId, cycle: 2.5, point: "cycle-start" as const }, positionMode: "free" as const };
    expect(validateCanonicalDocument({ ...base, annotations: [highlight] })).toEqual([]);
    expect(validateCanonicalDocument({ ...base, annotations: [{ ...highlight, positionMode: "cycle-snap" as const }] }).some((problem) => problem.path.includes("cycle"))).toBe(true);
  });

  it("changes mode through one history unit and preserves semantic anchors", () => {
    const base = canonicalFixture();
    const annotation = { id: "highlight_mode" as AnnotationId, type: "highlight" as const, label: "H", visible: true, start: { signalId: "sig_clk" as SignalId, cycle: 2, point: "cycle-start" as const }, end: { signalId: "sig_clk" as SignalId, cycle: 3, point: "cycle-start" as const } };
    const session = new CommandHistorySession({ ...base, annotations: [annotation] });
    const result = session.execute({ id: "highlight_mode_command" as CommandId, type: "annotation.setPositionMode", annotationId: annotation.id, positionMode: "free" });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]).toMatchObject({ positionMode: "free", start: annotation.start, end: annotation.end });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]).toEqual(annotation);
  });
});
