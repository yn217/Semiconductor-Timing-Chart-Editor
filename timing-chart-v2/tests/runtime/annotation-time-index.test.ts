import { describe, expect, it } from "vitest";
import type { Annotation } from "@timing-chart-v2/schema";
import { annotationFields, annotationsNearViewport } from "../../apps/editor/src/runtime/annotation-overlays.js";

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
});
