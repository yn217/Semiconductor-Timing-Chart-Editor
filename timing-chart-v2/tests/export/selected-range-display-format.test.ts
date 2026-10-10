import { describe, expect, it } from "vitest";
import { buildExportScene } from "@timing-chart-v2/export";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const DATA = "sig_data" as SignalId;

/** A Hex Bus whose middle transition is switched to Binary per value. */
function hexBusWithBinaryTransition(): CanonicalDocument {
  const base = canonicalFixture();
  return {
    ...base,
    timeline: { ...base.timeline, end: 8, cycleCount: 8 },
    signals: [
      base.signals[0]!,
      { ...base.signals[1]!, values: [{ start: 0, value: "00" }, { start: 2, value: "A5", displayFormat: "binary" }, { start: 4, value: "0F" }] },
    ],
  };
}

function dataLabels(waveJson: string): readonly string[] {
  return (JSON.parse(waveJson) as { data?: readonly string[] }).data ?? [];
}

describe("selected-range export display format", () => {
  it("keeps the per-transition displayFormat of a windowed change", () => {
    const document = hexBusWithBinaryTransition();
    const full = buildExportScene(document, { format: "svg", scope: "document" });
    const windowed = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 3, end: 6 } });
    const fullData = dataLabels(full.waveforms.find((wave) => wave.signalId === DATA)!.waveJson);
    const windowedData = dataLabels(windowed.waveforms.find((wave) => wave.signalId === DATA)!.waveJson);
    // The Binary transition at cycle 2 is active at the window start (cycle 3) and must keep its label.
    expect(fullData[1]).toBe("0b10100101");
    expect(windowedData[0]).toBe(fullData[1]);
    expect(windowedData).toEqual(["0b10100101", "0x0F"]);
  });

  it("keeps the per-transition displayFormat of a change inside the window", () => {
    const document = hexBusWithBinaryTransition();
    const full = buildExportScene(document, { format: "svg", scope: "document" });
    const windowed = buildExportScene(document, { format: "svg", scope: "selected-range", range: { start: 1, end: 6 } });
    const fullData = dataLabels(full.waveforms.find((wave) => wave.signalId === DATA)!.waveJson);
    const windowedData = dataLabels(windowed.waveforms.find((wave) => wave.signalId === DATA)!.waveJson);
    expect(windowedData).toEqual([fullData[0], "0b10100101", "0x0F"]);
  });
});
