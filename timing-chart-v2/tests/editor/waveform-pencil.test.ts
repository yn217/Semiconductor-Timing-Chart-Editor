import { describe, expect, it } from "vitest";
import { applyPencilStroke, pencilLevelAtY, pencilTrajectory, type PencilLevel } from "../../apps/editor/src/waveform-pencil.js";

const change = (start: number, value: number | string, id?: string) => ({ ...(id === undefined ? {} : { id }), start, value }) as never;
const strokes = (entries: readonly (readonly [number, PencilLevel])[]) => new Map<number, PencilLevel>(entries);
const view = (values: readonly { start: number; value: string | number }[] | undefined) => values?.map((item) => [item.start, item.value]);

describe("Waveform Pencil level", () => {
  it("draws HIGH in the upper half of the row and LOW in the lower half", () => {
    expect(pencilLevelAtY(110, 100, 40)).toBe(1);
    expect(pencilLevelAtY(119.9, 100, 40)).toBe(1);
    expect(pencilLevelAtY(120, 100, 40)).toBe(0);
    expect(pencilLevelAtY(139, 100, 40)).toBe(0);
    expect(pencilLevelAtY(90, 100, 40)).toBe(1);
    expect(pencilLevelAtY(300, 100, 40)).toBe(0);
  });
});

describe("Waveform Pencil trajectory", () => {
  const level = (y: number): PencilLevel => y < 20 ? 1 : 0;
  it("paints only the current cell while the pointer stays in it", () => {
    expect(pencilTrajectory({ cell: 3, y: 5 }, { cell: 3, y: 30 }, level)).toEqual([[3, 0]]);
  });
  it("fills skipped cells along the trajectory in both directions without repainting the start cell", () => {
    expect(pencilTrajectory({ cell: 2, y: 5 }, { cell: 6, y: 35 }, level)).toEqual([[3, 1], [4, 0], [5, 0], [6, 0]]);
    expect(pencilTrajectory({ cell: 6, y: 35 }, { cell: 3, y: 5 }, level)).toEqual([[5, 0], [4, 1], [3, 1]]);
  });
});

describe("Waveform Pencil stroke", () => {
  it("changes only the painted cells and pins the value after the stroke", () => {
    const values = [change(0, 0, "a"), change(5, 1, "b")];
    const next = applyPencilStroke(values, 10, strokes([[2, 1], [3, 1]]));
    expect(view(next)).toEqual([[0, 0], [2, 1], [4, 0], [5, 1]]);
    expect(next?.[0]).toMatchObject({ id: "a" });
    expect(next?.find((item) => item.start === 5)).toMatchObject({ id: "b" });
    expect(next?.find((item) => item.start === 2)?.id).toBeUndefined();
  });
  it("lets a later paint of the same cell win and keeps a one-cell glitch", () => {
    const next = applyPencilStroke([change(0, 0)], 8, strokes([[3, 1], [3, 0], [4, 1]]));
    expect(view(next)).toEqual([[0, 0], [4, 1], [5, 0]]);
  });
  it("folds redundant change points next to the stroke and returns undefined for an unchanged waveform", () => {
    expect(view(applyPencilStroke([change(0, 0), change(2, 1), change(4, 0)], 8, strokes([[2, 0], [3, 0]])))).toEqual([[0, 0]]);
    expect(applyPencilStroke([change(0, 0), change(2, 1)], 8, strokes([[3, 1], [0, 0]]))).toBeUndefined();
  });
  it("repaints back over an earlier stroke and keeps the last cell of the timeline valid", () => {
    expect(view(applyPencilStroke([change(0, 0)], 4, strokes([[3, 1]])))).toEqual([[0, 0], [3, 1]]);
    expect(view(applyPencilStroke([change(0, "0"), change(2, "1")], 6, strokes([[0, 1]])))).toEqual([[0, "1"], [1, "0"], [2, "1"]]);
  });
});
