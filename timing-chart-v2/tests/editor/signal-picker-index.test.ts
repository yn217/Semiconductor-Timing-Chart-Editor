import { describe, expect, it } from "vitest";
import { signalPickerIndex } from "../../apps/editor/src/signal-picker-index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Signal picker index", () => {
  it("shares one stable-ID projection per immutable Signal collection and refreshes on replacement", () => {
    const signals = canonicalFixture().signals;
    const index = signalPickerIndex(signals);
    expect(signalPickerIndex(signals)).toBe(index);
    expect(index.entries.map((entry) => entry.id)).toEqual(signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id));
    expect(index.byId.get(signals[0]!.id)?.label).toBe(signals[0]!.display.name);
    expect(index.labelsById.get(signals[0]!.id)).toBe(signals[0]!.display.name);

    const renamedSignals = signals.map((signal, signalIndex) => signalIndex === 0
      ? { ...signal, display: { ...signal.display, name: "Renamed Clock" } }
      : signal);
    const renamed = signalPickerIndex(renamedSignals);
    expect(renamed).not.toBe(index);
    expect(renamed.byId.get(signals[0]!.id)?.label).toBe("Renamed Clock");
    expect(renamed.entries.find((entry) => entry.id === signals[0]!.id)?.searchText).toContain("renamed clock");
  });
});
