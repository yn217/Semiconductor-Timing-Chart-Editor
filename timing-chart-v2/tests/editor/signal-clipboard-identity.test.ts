import { copySignalWithFreshValueChangeIds } from "../../apps/editor/src/application/signal-clipboard-identity.js";
import type { Signal } from "../../packages/schema/src/types.js";
import { describe, expect, it } from "vitest";

describe("Signal clipboard identity", () => {
  it("remaps every nested value/enable ID with one caller-owned allocator", () => {
    const valueSignal: Signal = {
      id: "sig_values" as never, name: "DATA", type: "binary", role: "internal",
      source: { instancePath: [], signalName: "data" }, display: { name: "DATA" },
      values: [
        { id: "value_a", start: 0, value: 0, comment: "reset" },
        { id: "value_b", start: 4, value: 1 },
      ],
    };
    const clockSignal: Signal = {
      id: "sig_clock" as never, name: "CLK", type: "clock", role: "internal",
      source: { instancePath: [], signalName: "clk" }, display: { name: "CLK" },
      generator: { start: 0, period: 2, phase: 0, duty: 50, initial: 0, polarity: "positive" },
      enable: [{ id: "enable_a", start: 2, value: 1 }, { id: "enable_b", start: 6, value: 0 }],
      edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: 0 } },
    };
    const usedIds = new Set(["value_a", "value_b", "enable_a", "enable_b"]);
    let sequence = 0;
    const allocate = () => {
      const id = `signalValueChange_copy_${++sequence}`;
      if (usedIds.has(id)) throw new Error(`Allocator returned duplicate ID ${id}`);
      usedIds.add(id);
      return id;
    };

    const copiedValue = copySignalWithFreshValueChangeIds(valueSignal, "sig_values_copy" as never, allocate);
    const copiedClock = copySignalWithFreshValueChangeIds(clockSignal, "sig_clock_copy" as never, allocate);

    expect(copiedValue).toMatchObject({ id: "sig_values_copy", type: "binary", name: "DATA", values: [
      { start: 0, value: 0, comment: "reset" }, { start: 4, value: 1 },
    ] });
    expect(copiedClock).toMatchObject({ id: "sig_clock_copy", type: "clock", generator: clockSignal.type === "clock" ? clockSignal.generator : undefined, enable: [
      { start: 2, value: 1 }, { start: 6, value: 0 },
    ] });
    const sourceIds = [...valueSignal.values.map(({ id }) => id), ...(clockSignal.type === "clock" ? clockSignal.enable?.map(({ id }) => id) ?? [] : [])];
    const copiedIds = [
      ...(copiedValue.type === "clock" || copiedValue.type === "commentRow" ? [] : copiedValue.values.map(({ id }) => id)),
      ...(copiedClock.type === "clock" ? copiedClock.enable?.map(({ id }) => id) ?? [] : []),
    ];
    expect(copiedIds.every((id) => typeof id === "string" && !sourceIds.includes(id))).toBe(true);
    expect(new Set(copiedIds).size).toBe(copiedIds.length);
    expect(copiedIds).toEqual(["signalValueChange_copy_1", "signalValueChange_copy_2", "signalValueChange_copy_3", "signalValueChange_copy_4"]);
  });

  it("does not invent nested identities for Comment Rows", () => {
    const comment: Signal = { id: "row_comment" as never, type: "commentRow", name: "Note", role: "internal", source: { instancePath: [], signalName: "" }, display: { name: "Note" }, title: "Title", body: "Body" };
    expect(copySignalWithFreshValueChangeIds(comment, "row_comment_copy" as never, () => { throw new Error("Comment Rows have no value IDs"); })).toEqual({ ...comment, id: "row_comment_copy" });
  });
});
