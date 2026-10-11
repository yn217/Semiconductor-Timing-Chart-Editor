import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CanonicalDocument, CommandId, SignalValueChange } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// #855: timeline.duplicateRange / moveRange are sparse; they must equal the previous dense per-cycle definition exactly.
const valueAt = (changes: readonly SignalValueChange[], at: number) => { let result: SignalValueChange | undefined; for (const change of changes) if (change.start <= at) result = change; else break; return result; };
const same = (a: SignalValueChange | undefined, b: SignalValueChange | undefined) => a?.value === b?.value && a?.comment === b?.comment;
const compress = (states: readonly (SignalValueChange | undefined)[]) => { const out: SignalValueChange[] = []; let previous: SignalValueChange | undefined; states.forEach((state, start) => { if (state && !same(state, previous)) out.push({ start, value: state.value, ...(state.comment === undefined ? {} : { comment: state.comment }) }); previous = state; }); return out; };
const dense = (changes: readonly SignalValueChange[], cycleCount: number) => Array.from({ length: cycleCount }, (_, cycle) => valueAt(changes, cycle));
const moveIndex = (cycle: number, start: number, end: number, to: number) => { const length = end - start; if (to < start) { if (cycle >= start && cycle < end) return to + (cycle - start); if (cycle >= to && cycle < start) return cycle + length; return cycle; } const originalDestination = to + length; if (cycle >= start && cycle < end) return to + (cycle - start); if (cycle >= end && cycle < originalDestination) return cycle - length; return cycle; };
const denseDuplicate = (changes: readonly SignalValueChange[], cycleCount: number, start: number, end: number, at: number) => { const states = dense(changes, cycleCount); states.splice(at, 0, ...states.slice(start, end)); return compress(states); };
const denseMove = (changes: readonly SignalValueChange[], cycleCount: number, start: number, end: number, to: number) => { const moved = Array<SignalValueChange | undefined>(cycleCount); dense(changes, cycleCount).forEach((state, cycle) => { moved[moveIndex(cycle, start, end, to)] = state; }); return compress(moved); };

const lcg = (seed: number) => { let state = seed >>> 0; return (limit: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % limit; }; };

describe("sparse range transforms equal the dense reference", () => {
  it("keeps original Transition IDs when a range is duplicated before its source", () => {
    const base = structuredClone(canonicalFixture()) as CanonicalDocument;
    const index = base.signals.findIndex((signal) => signal.type === "bus");
    const signal = base.signals[index]!;
    if (signal.type !== "bus") throw new Error("fixture needs a bus signal");
    const values: SignalValueChange[] = [
      { id: "original_zero", start: 0, value: "0x01" },
      { id: "original_three", start: 3, value: "0x02" },
      { id: "original_five", start: 5, value: "0x03" },
    ];
    base.signals[index] = { ...signal, values };
    const session = new CommandHistorySession(base);
    expect(session.execute({ id: "duplicate_ids" as CommandId, type: "timeline.duplicateRange", start: 3, end: 5, at: 1 }).ok).toBe(true);
    const result = () => (session.getSnapshot().document.signals[index] as typeof signal).values;
    const duplicated = structuredClone(result());
    expect(duplicated.find((change) => change.start === 1)?.id).not.toBe("original_three");
    expect(duplicated.find((change) => change.start === 3)?.id).not.toBe("original_zero");
    expect(duplicated.find((change) => change.start === 5)?.id).toBe("original_three");
    expect(duplicated.find((change) => change.start === 7)?.id).toBe("original_five");
    expect(new Set(duplicated.map((change) => change.id)).size).toBe(duplicated.length);
    session.undo();
    expect(result()).toEqual(values);
    session.redo();
    expect(result()).toEqual(duplicated);
  });

  it("random duplicate/move ranges on a random sparse Signal", () => {
    const rand = lcg(855);
    let compared = 0;
    for (let round = 0; round < 60; round += 1) {
      const base = structuredClone(canonicalFixture()) as CanonicalDocument;
      const cycleCount = 30;
      base.timeline = { ...base.timeline, cycleCount, end: cycleCount } as CanonicalDocument["timeline"];
      const index = base.signals.findIndex((signal) => signal.type === "bus");
      const signal = base.signals[index]!;
      if (signal.type !== "bus") throw new Error("fixture needs a bus signal");
      const starts = [...new Set([0, ...Array.from({ length: rand(6) }, () => rand(cycleCount))])].sort((a, b) => a - b);
      const values: SignalValueChange[] = starts.map((start, position) => ({ start, value: ["0x01", "0x02", "0x03"][(position + rand(2)) % 3]! }));
      base.signals = base.signals.map((entry, position) => position === index ? { ...signal, values } : entry);
      const start = rand(cycleCount - 1), end = start + 1 + rand(Math.min(8, cycleCount - start - 1));
      const session = new CommandHistorySession(base);
      const duplicateAt = rand(cycleCount + 1);
      const duplicated = session.execute({ id: `dup_${round}` as CommandId, type: "timeline.duplicateRange", start, end, at: duplicateAt });
      if (duplicated.ok) {
        const next = session.getSnapshot().document.signals[index]!;
        expect((next as { values: SignalValueChange[] }).values).toEqual(denseDuplicate(values, cycleCount, start, end, duplicateAt));
        compared += 1;
        session.undo();
      }
      const to = rand(cycleCount - (end - start) + 1);
      const moved = session.execute({ id: `mov_${round}` as CommandId, type: "timeline.moveRange", start, end, to });
      if (moved.ok) {
        const next = session.getSnapshot().document.signals[index]!;
        expect((next as { values: SignalValueChange[] }).values).toEqual(denseMove(values, cycleCount, start, end, to));
        compared += 1;
      }
    }
    expect(compared, "the random cases must actually exercise both transforms").toBeGreaterThan(60);
  });
});
