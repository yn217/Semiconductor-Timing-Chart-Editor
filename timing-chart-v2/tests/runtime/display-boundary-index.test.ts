import { describe, expect, it } from "vitest";
import { buildDisplayTimeMapping } from "@timing-chart-v2/projection";
import { displayBoundaryForSource } from "../../apps/editor/src/runtime/display-boundary.js";

// #862: cached next-visible boundary and cached sorted label anchors must equal the previous linear definitions.
const timeline = { cycleCount: 40, labelAnchors: [{ source: 30, display: 300 }, { source: 5, display: 50 }, { source: 12, display: 120 }] } as never;
const group = (start: number, end: number) => ({ id: `g${start}`, name: "fold", start, end, presentation: { collapsed: true } }) as never;

describe("display mapping lookups", () => {
  const mapping = buildDisplayTimeMapping(timeline, [group(10, 20)]);
  it("resolves a folded source cycle to the next visible boundary (linear reference)", () => {
    for (let source = 0; source <= 40; source += 1) {
      let expected: number | undefined;
      if (source === 40) expected = mapping.displayCycleCount;
      else if (mapping.displayAtSource(source) !== undefined) expected = mapping.displayAtSource(source)!;
      else { expected = mapping.displayCycleCount; for (let next = source + 1; next < 40; next += 1) { const display = mapping.displayAtSource(next); if (display !== undefined) { expected = display; break; } } }
      expect(displayBoundaryForSource(mapping, source, 40)).toBe(expected);
    }
  });
  it("labels equal the sorted-anchor reference, repeatedly and for unordered authored anchors", () => {
    const identity = buildDisplayTimeMapping(timeline, []);
    const anchors = [{ source: 30, display: 300 }, { source: 5, display: 50 }, { source: 12, display: 120 }].sort((l, r) => l.source - r.source);
    const reference = (cycle: number) => { const active = [...anchors].reverse().find((anchor) => anchor.source <= cycle); return active ? active.display + (cycle - active.source) : cycle; };
    for (let pass = 0; pass < 2; pass += 1) for (let cycle = 0; cycle < 40; cycle += 1) expect(identity.labelFor(cycle)).toBe(reference(cycle));
  });
});
