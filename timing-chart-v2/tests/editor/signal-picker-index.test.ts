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

  it("preserves stable-ID lookup across rename, reorder, and group-only replacement", () => {
    const source = canonicalFixture();
    const selectedId = source.signals[1]!.id;
    const renamed = source.signals.map((signal, index) => index === 1
      ? { ...signal, display: { ...signal.display, name: "Renamed Data" } }
      : signal);
    const renamedIndex = signalPickerIndex(renamed);
    expect(renamedIndex.byId.get(selectedId)?.id).toBe(selectedId);
    expect(renamedIndex.byId.get(selectedId)?.label).toBe("Renamed Data");

    const reordered = [...renamed].reverse();
    const reorderedIndex = signalPickerIndex(reordered);
    expect(reorderedIndex.byId.get(selectedId)?.id).toBe(selectedId);
    expect(reorderedIndex.byId.get(selectedId)?.label).toBe("Renamed Data");
    expect(reorderedIndex.entries[0]?.id).toBe(reordered.find((signal) => signal.type !== "commentRow")?.id);

    // Group placement is outside the picker index domain; unchanged Signal collection identity reuses its index.
    const movedGroupDocument = { ...source, signalGroups: [...source.signalGroups].reverse() };
    expect(signalPickerIndex(movedGroupDocument.signals)).toBe(signalPickerIndex(source.signals));
  });
});
