import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("canonical clock phase validation", () => {
  it("rejects a phase the semantic command and WaveDrom geometry cannot represent", () => {
    const source = canonicalFixture();
    const clock = source.signals[0]!;
    if (clock.type !== "clock") throw new Error("fixture signal must be a clock");
    const input = {
      ...source,
      signals: source.signals.map((signal) => signal.id === clock.id
        ? { ...signal, generator: { ...clock.generator, phase: 0.25 } }
        : signal),
    };

    expect(parseDocument(input)).toMatchObject({
      ok: false,
      kind: "validation",
      problems: [expect.objectContaining({
        code: "UNSUPPORTED_CLOCK_PHASE",
        path: "$.signals[0].generator.phase",
        entityId: clock.id,
      })],
    });
  });

  it("keeps the committed Large Feature Showcase inside the canonical clock contract", async () => {
    const input = await readFile(new URL("../../samples/showcase/21_large_feature_showcase.tcd.json", import.meta.url), "utf8");
    expect(parseDocument(input)).toMatchObject({ ok: true });
  });

  it("uses a conventional 50% duty cycle for the showcase AXI clock", async () => {
    const input = await readFile(new URL("../../samples/showcase/21_large_feature_showcase.tcd.json", import.meta.url), "utf8");
    const parsed = parseDocument(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const axiClock = parsed.document.signals.find((signal) => signal.id === "s.axiclk");
    expect(axiClock).toMatchObject({ type: "clock", generator: { duty: 0.5 } });
  });
});
