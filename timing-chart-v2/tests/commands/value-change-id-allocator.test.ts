import { describe, expect, it } from "vitest";
import type { SignalValueChange } from "@timing-chart-v2/schema";
import { ValueChangeIdAllocator } from "../../packages/commands/src/value-change-id-allocator.js";

describe("Signal-scoped value-change ID allocation", () => {
  it("honors document-wide reserved IDs even when the Signal-local sequence index is warm", () => {
    const allocator = new ValueChangeIdAllocator();
    const values = [{ id: "legacy_change", start: 0, value: 0 }] as SignalValueChange[];
    allocator.remember("sig_warm", values, { usedIds: new Set(["legacy_change"]), nextSequence: 1 });

    const allocation = allocator.allocate("sig_warm", values, new Set(["value_sig_warm_1"]));

    expect(allocation.id).toBe("value_sig_warm_2");
    expect(allocation.valuesVisited).toBe(0);
  });

  it("indexes a million existing changes once, then allocates from the cached sequence", () => {
    const allocator = new ValueChangeIdAllocator();
    const existingId = "value_sig_dense_0";
    const repeatedValue = { id: existingId, start: 0, value: "0" } as SignalValueChange;
    const values = {
      *[Symbol.iterator]() {
        for (let index = 0; index < 1_000_000; index += 1) yield repeatedValue;
      },
    } as unknown as readonly SignalValueChange[];

    const first = allocator.allocate("sig_dense", values);
    expect(first).toMatchObject({ id: "value_sig_dense_1", valuesVisited: 1_000_000 });

    let index = first.nextIndex;
    for (let sequence = 2; sequence < 102; sequence += 1) {
      const nextValues = {
        [Symbol.iterator]() {
          throw new Error("A cached ID allocation must not revisit existing values.");
        },
      } as unknown as readonly SignalValueChange[];
      allocator.remember("sig_dense", nextValues, index);
      const next = allocator.allocate("sig_dense", nextValues);
      expect(next).toMatchObject({ id: `value_sig_dense_${sequence}`, valuesVisited: 0 });
      index = next.nextIndex;
    }
  });
});
