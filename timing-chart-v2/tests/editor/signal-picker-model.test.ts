import { describe, expect, it } from "vitest";
import type { SignalId } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { searchSignalPicker, SIGNAL_PICKER_RESULT_LIMIT, signalPickerIndex, signalPickerScrollAdjustment } from "../../apps/editor/src/signal-picker-model.js";

describe("shared Signal picker index", () => {
  it("reuses the stable-ID index for one immutable collection and invalidates by collection identity", () => {
    const document = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 100 });
    const first = signalPickerIndex(document.signals);

    expect(signalPickerIndex(document.signals)).toBe(first);
    expect(first.entries).toHaveLength(10_000);
    expect(first.byId.get("sig_perf_9999" as SignalId)?.label).toBe("SIG_9999");
    expect(signalPickerIndex([...document.signals])).not.toBe(first);
  });

  it("caps empty-query and filtered result windows while keeping late stable IDs searchable", () => {
    const document = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 100 });
    const index = signalPickerIndex(document.signals);

    expect(searchSignalPicker(index, "")).toHaveLength(SIGNAL_PICKER_RESULT_LIMIT);
    expect(searchSignalPicker(index, "sig_9999").map((entry) => entry.id)).toContain("sig_perf_9999");
    expect(searchSignalPicker(index, "SIG_", 7)).toHaveLength(7);
  });

  it("scrolls only enough to reveal a keyboard-active option", () => {
    expect(signalPickerScrollAdjustment(100, 280, 80, 120)).toBe(-20);
    expect(signalPickerScrollAdjustment(100, 280, 260, 300)).toBe(20);
    expect(signalPickerScrollAdjustment(100, 280, 140, 170)).toBe(0);
  });
});
