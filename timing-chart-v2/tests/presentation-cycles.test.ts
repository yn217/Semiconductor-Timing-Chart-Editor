import { describe, expect, it } from "vitest";
import { presentationCycles } from "../apps/editor/src/presentation-cycles.js";

// Ruler/grid ticks used to thin at a fixed 80-cycle count regardless of zoom,
// so a long document (e.g. 160 cycles) always showed every-other cycle even
// at 100% zoom with ample pixels per cycle -- misread as "cycle numbers
// aren't incrementing by 1". Thinning must depend only on actual on-screen
// pixel pitch, never on cycle count alone.
describe("presentationCycles", () => {
  it("returns every cycle when no pixel pitch is supplied, regardless of cycle count", () => {
    expect(presentationCycles(160)).toHaveLength(161);
    expect(presentationCycles(160)).toEqual(Array.from({ length: 161 }, (_, cycle) => cycle));
  });

  it("returns every cycle when pixels-per-cycle keeps ticks legibly spaced, even for a long document", () => {
    const cycles = presentationCycles(160, 40);
    expect(cycles).toHaveLength(161);
    expect(cycles.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("thins ticks only once pixel pitch would make labels overlap", () => {
    // 10px/cycle needs a stride of ceil(28/10) = 3 to keep >=28px between ticks.
    const cycles = presentationCycles(160, 10);
    expect(cycles.slice(0, 6)).toEqual([0, 3, 6, 9, 12, 15]);
    expect(cycles.at(-1)).toBe(160);
  });

  it("always includes cycle 0 and the exact terminal cycle even when it does not land on the stride", () => {
    const cycles = presentationCycles(20, 2);
    expect(cycles[0]).toBe(0);
    expect(cycles.at(-1)).toBe(20);
  });

  it("thins a short document too, once zoomed out far enough to overlap", () => {
    const cycles = presentationCycles(20, 1);
    expect(cycles.length).toBeLessThan(21);
    expect(cycles[0]).toBe(0);
    expect(cycles.at(-1)).toBe(20);
  });
});
