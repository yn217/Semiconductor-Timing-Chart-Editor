import { describe, expect, it } from "vitest";
import type { Annotation } from "@timing-chart-v2/schema";
import { annotationFields, annotationsNearViewport, indexedAnnotationsNearViewport } from "../../apps/editor/src/runtime/annotation-overlays.js";

// #863: the time index must return a superset (in document order) of every Annotation that has a time hit in the viewport.
const make = (count: number): Annotation[] => Array.from({ length: count }, (_, index) => {
  const cycle = (index * 37) % 5000;
  if (index % 7 === 0) return { id: `a${index}`, type: "range", label: "r", visible: true, start: { cycle, point: "cycle-start" }, end: { cycle: cycle + (index % 5) * 900, point: "cycle-end" } } as unknown as Annotation;
  if (index % 11 === 0) return { id: `a${index}`, type: "marker", label: "m", visible: true } as unknown as Annotation; // no anchors
  return { id: `a${index}`, type: "callout", label: "c", visible: true, anchor: { cycle, point: "cycle-start" } } as unknown as Annotation;
});
const timeHit = (annotation: Annotation, start: number, end: number) => {
  const anchors = annotationFields.map((field) => annotation[field]).filter(Boolean) as { cycle: number }[];
  return anchors.some((anchor) => anchor.cycle >= start && anchor.cycle <= end) || Boolean(annotation.start && annotation.end && Math.min(annotation.start.cycle, annotation.end.cycle) <= end && Math.max(annotation.start.cycle, annotation.end.cycle) >= start);
};

describe("annotationsNearViewport", () => {
  const annotations = make(2000);
  it.each([[0, 100], [1234, 1300], [4000, 5200], [2500, 2500], [6000, 7000]])("covers every time hit in [%s, %s] in document order", (start, end) => {
    const near = annotationsNearViewport(annotations, start, end);
    const positions = near.map((annotation) => annotations.indexOf(annotation));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    const expected = annotations.filter((annotation) => timeHit(annotation, start, end));
    for (const annotation of expected) expect(near).toContain(annotation);
    expect(near.length).toBeLessThan(annotations.length); // actually narrows
  });

  it("injects pinned stable IDs without scanning the full collection and retains document order", () => {
    const large = make(20_000);
    const pinned = large[19_999]!;
    const result = indexedAnnotationsNearViewport(large, 0, 20, new Set([pinned.id]));
    expect(result.items).toContain(pinned);
    expect(result.pinnedInjectedCount).toBe(1);
    expect(result.indexEntriesVisited).toBeLessThan(large.length / 10);
    const positions = result.items.map((item) => large.indexOf(item));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("queries only overlapping wide intervals instead of visiting every long-range Annotation", () => {
    const count = 2_000;
    const wide = Array.from({ length: count }, (_, index) => {
      const start = 10_000 + index * 10_000;
      return { id: `wide${index}`, type: "range", label: "long", visible: true, start: { cycle: start, point: "cycle-start" }, end: { cycle: start + 5_000, point: "cycle-end" } } as unknown as Annotation;
    });
    const targetIndex = 1_234;
    const target = wide[targetIndex]!;
    const result = indexedAnnotationsNearViewport(wide, 10_000 + targetIndex * 10_000 + 100, 10_000 + targetIndex * 10_000 + 200);

    expect(result.items).toEqual([target]);
    expect(result.indexEntriesVisited).toBe(1);
  });

  it.each([[100, 0, 100, 110], [-100, 120, 20, 30]])("indexes Ghost Trace's shifted interval for offset %i", (offset, rawStart, viewStart, viewEnd) => {
    const ghost = { id: "ghost", type: "ghostTrace", label: "g", visible: true, traceOffsetCycles: offset, start: { cycle: rawStart, point: "cycle-start" }, end: { cycle: rawStart + 10, point: "cycle-end" } } as unknown as Annotation;
    const result = indexedAnnotationsNearViewport([ghost, ...make(1000)], viewStart, viewEnd);
    expect(result.items).toContain(ghost);
  });
});

describe("wide-interval index with a full-span Annotation (#175/#863)", () => {
  const wideRange = (id: string, start: number, end: number) => ({ id, type: "range", label: "w", visible: true, start: { cycle: start, point: "cycle-start" }, end: { cycle: end, point: "cycle-end" } } as unknown as Annotation);
  const build = (count: number): Annotation[] => [
    wideRange("full", 0, 10_000 * count + 10_000),
    ...Array.from({ length: count }, (_, index) => wideRange(`w${index}`, 10_000 + index * 10_000, 10_000 + index * 10_000 + 5_000)),
  ];
  // Reference: every wide time hit, document order.
  const reference = (annotations: readonly Annotation[], start: number, end: number) => annotations.filter((annotation) => annotation.start!.cycle <= end && annotation.end!.cycle >= start);

  it("visits matches + O(log N) at the END of the timeline, not every wide interval", () => {
    const count = 20_000;
    const annotations = build(count);
    const last = 10_000 + (count - 1) * 10_000;
    const result = indexedAnnotationsNearViewport(annotations, last + 100, last + 200);
    expect(result.items.map((item) => item.id)).toEqual(["full", `w${count - 1}`]);
    expect(result.indexEntriesVisited).toBeLessThanOrEqual(result.items.length + 2);
    expect(result.wideNodesVisited).toBeLessThanOrEqual(4 * (result.items.length + 1) * Math.ceil(Math.log2(count + 1)));
  });

  it("returns the same items as a brute-force overlap scan over randomized windows", () => {
    let seed = 175;
    const random = () => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed / 2_147_483_648; };
    const annotations: Annotation[] = Array.from({ length: 3_000 }, (_, index) => {
      const start = Math.floor(random() * 2_000_000);
      const length = random() < 0.05 ? Math.floor(random() * 2_000_000) : 4_096 + Math.floor(random() * 60_000);
      return wideRange(`r${index}`, start, start + length);
    });
    for (let trial = 0; trial < 400; trial += 1) {
      const start = Math.floor(random() * 2_100_000) - 50_000;
      const end = start + Math.floor(random() * (trial % 4 === 0 ? 300_000 : 3_000));
      expect(indexedAnnotationsNearViewport(annotations, start, end).items).toEqual(reference(annotations, start, end));
    }
  });
});
