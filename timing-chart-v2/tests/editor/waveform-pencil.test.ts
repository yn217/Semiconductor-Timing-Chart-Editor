import { describe, expect, it } from "vitest";
import { beginWaveformPencilStroke, extendWaveformPencilStroke, finishWaveformPencilStroke } from "../../apps/editor/src/runtime/waveform-pencil.js";

describe("Waveform Pencil stroke projection (#1109)", () => {
  it("interpolates every crossed source cycle in either direction", () => {
    const down = beginWaveformPencilStroke([{ id: "v0", start: 0, value: 0 }], 12, 2, 0.9)!;
    const filled = extendWaveformPencilStroke(down, 7, 0.1);
    expect([...filled.samples]).toEqual([[2, 0], [3, 0], [4, 0], [5, 1], [6, 1], [7, 1]]);

    const reverse = extendWaveformPencilStroke(filled, 3, 0.9);
    expect([...reverse.samples]).toEqual([[2, 0], [3, 0], [4, 0], [5, 0], [6, 1], [7, 1]]);
  });

  it("uses the last revisit, preserves existing transition identity, and adds only sampled cycle points", () => {
    const stroke = beginWaveformPencilStroke([
      { id: "stable-zero", start: 0, value: 0 },
      { id: "stable-four", start: 4, value: 1, comment: "keep metadata" },
    ], 8, 2, 0.1)!;
    const revisited = extendWaveformPencilStroke(extendWaveformPencilStroke(stroke, 5, 0.1), 4, 0.9);
    expect(finishWaveformPencilStroke(revisited)).toEqual([
      { id: "stable-zero", start: 0, value: 0 },
      { start: 2, value: 1 },
      { id: "stable-four", start: 4, value: 0, comment: "keep metadata" },
      { start: 5, value: 1 },
    ]);
  });

  it("restores unpainted canonical values after a painted cell and returns the original table for a no-op", () => {
    const values = [{ id: "zero", start: 0, value: 0 }, { id: "five", start: 5, value: 1 }];
    const noOp = beginWaveformPencilStroke(values, 8, 2, 0.9)!;
    expect(finishWaveformPencilStroke(noOp)).toBe(values);

    const changed = beginWaveformPencilStroke(values, 8, 2, 0.1)!;
    expect(finishWaveformPencilStroke(changed)).toEqual([
      values[0],
      { start: 2, value: 1 },
      { start: 3, value: 0 },
      values[1],
    ]);
  });

  it("does not discard an unpainted same-level transition or its stable metadata", () => {
    const values = [
      { id: "zero", start: 0, value: 0 },
      { id: "note", start: 5, value: 0, comment: "unrelated note" },
    ];
    const stroke = beginWaveformPencilStroke(values, 8, 2, 0.1)!;
    expect(finishWaveformPencilStroke(stroke)).toEqual([
      values[0],
      { start: 2, value: 1 },
      { start: 3, value: 0 },
      values[1],
    ]);
  });

  it("does not start or extend outside canonical cycle bounds", () => {
    expect(beginWaveformPencilStroke([{ start: 0, value: 0 }], 4, 4, 1)).toBeUndefined();
    const stroke = beginWaveformPencilStroke([{ start: 0, value: 0 }], 4, 1, 0.9)!;
    expect(extendWaveformPencilStroke(stroke, 4, 0.1)).toBe(stroke);
    expect(finishWaveformPencilStroke(stroke)).toEqual([{ start: 0, value: 0 }]);
  });
});
