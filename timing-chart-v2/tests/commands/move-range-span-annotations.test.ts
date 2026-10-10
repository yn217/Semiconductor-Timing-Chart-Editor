import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { AnnotationId, CommandId, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

function withRange(start: number, end: number) {
  const document = canonicalFixture();
  const anchor = (cycle: number) => ({ signalId: "sig_data" as SignalId, cycle, point: "cycle-start" as const });
  return { ...document, timeline: { ...document.timeline, cycleCount: 16, end: 16 }, annotations: [{ id: "ann_range" as AnnotationId, type: "range" as const, label: "Range", visible: true, start: anchor(start), end: anchor(end) }] };
}

describe("timeline.moveRange and span annotations", () => {
  it("rejects a move that would leave a Range annotation's end before its start", () => {
    const session = new CommandHistorySession(withRange(3, 6) as never);
    // Moving [5,10) to 2 puts cycle 3 after the block (-> 8) and cycle 6 inside it (-> 3): the span would invert.
    const result = session.execute({ id: "move_split" as CommandId, type: "timeline.moveRange", start: 5, end: 10, to: 2 });
    expect(result.ok).toBe(false);
    const annotation = session.getSnapshot().document.annotations[0]!;
    expect(annotation.start!.cycle).toBe(3);
    expect(annotation.end!.cycle).toBe(6);
  });

  it("still moves a span that travels with the block or stays outside it", () => {
    const session = new CommandHistorySession(withRange(6, 8) as never);
    const result = session.execute({ id: "move_whole" as CommandId, type: "timeline.moveRange", start: 5, end: 10, to: 0 });
    expect(result.ok).toBe(true);
    const annotation = session.getSnapshot().document.annotations[0]!;
    expect(annotation.start!.cycle).toBeLessThanOrEqual(annotation.end!.cycle);
  });
});
