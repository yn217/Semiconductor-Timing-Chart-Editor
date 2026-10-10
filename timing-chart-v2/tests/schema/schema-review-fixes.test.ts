import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateV1 } from "../../packages/schema/src/migration.js";
import { scanJsonSyntax } from "../../packages/schema/src/json-syntax.js";
import { parseDocument } from "../../packages/schema/src/serialization.js";
import { validateCanonicalDocument } from "../../packages/schema/src/validation.js";

function loadSample(name: string): any {
  return JSON.parse(readFileSync(new URL(`../../samples/current/${name}`, import.meta.url), "utf8"));
}

function v1WithSignals(signals: unknown[], annotations: unknown[] = []): Record<string, unknown> {
  return {
    formatVersion: 1,
    document: { id: "doc", title: "Review fixes" },
    timeline: { cycleCount: 10 },
    signals,
    annotations,
  };
}

describe("schema review fixes: JSON syntax diagnostics", () => {
  it("returns a JSON_SYNTAX diagnostic instead of throwing for deeply nested invalid JSON", () => {
    const source = "[".repeat(5000);
    expect(() => scanJsonSyntax(source)).not.toThrow();
    const result = parseDocument(source);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatchObject({ code: "JSON_SYNTAX" });
  });

  it("reports deeply nested invalid JSON with a syntax location instead of an exception", () => {
    const source = `${"{\"a\":[".repeat(3000)}1 2`;
    const diagnostic = scanJsonSyntax(source);
    expect(diagnostic).toMatchObject({ code: "JSON_SYNTAX" });
    expect(diagnostic?.line).toBeGreaterThanOrEqual(1);
  });
});

describe("schema review fixes: v1 anchor migration", () => {
  it("opens a v1 file whose first signal is a comment row with a cycle-start annotation", () => {
    const source = v1WithSignals(
      [
        { id: "sig_note", name: "NOTE", type: "commentRow", title: "Note", body: "text" },
        { id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] },
      ],
      [{ id: "ann_text", type: "text", label: "t", visible: true, anchor: { cycle: 1, point: "cycle-start" } }],
    );
    const result = parseDocument(JSON.stringify(source));
    expect(result).toMatchObject({ ok: true });
  });

  it("opens a v1 file whose transition-start annotation has no signalId and a clock first", () => {
    const source = v1WithSignals(
      [
        { id: "sig_clk", name: "CLK", type: "clock", role: "input", generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } },
        { id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] },
      ],
      [{ id: "ann_edge", type: "text", label: "t", visible: true, anchor: { cycle: 1, point: "transition-start" } }],
    );
    const result = parseDocument(JSON.stringify(source));
    expect(result).toMatchObject({ ok: true });
  });

  it("keeps an unambiguous signal-less anchor bound to a compatible timing signal", () => {
    const source = v1WithSignals(
      [
        { id: "sig_note", name: "NOTE", type: "commentRow", title: "Note", body: "text" },
        { id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] },
      ],
      [{ id: "ann_text", type: "text", label: "t", visible: true, anchor: { cycle: 1, point: "cycle-start" } }],
    );
    const migrated = migrateV1(source);
    const annotation = migrated.document.annotations[0] as { anchor?: { signalId?: string } };
    expect(annotation.anchor?.signalId).toBe("sig_data");
  });

  it("does not copy width or displayFormat onto value types that the schema forbids them on", () => {
    for (const type of ["binary", "state", "logic", "event", "pulse"] as const) {
      const value = type === "state" ? "IDLE" : type === "event" ? "none" : "0";
      const source = v1WithSignals([{ id: "sig_x", name: "X", type, role: "input", width: 1, displayFormat: "hex", values: [{ start: 0, value }] }]);
      const result = parseDocument(JSON.stringify(source));
      expect(result, type).toMatchObject({ ok: true });
    }
  });

  it("still carries width and displayFormat onto bus signals", () => {
    const source = v1WithSignals([{ id: "sig_bus", name: "BUS", type: "bus", role: "input", width: 4, displayFormat: "hex", values: [{ start: 0, value: "A" }] }]);
    const migrated = migrateV1(source);
    const bus = migrated.document.signals[0] as { width?: number; displayFormat?: string };
    expect(bus).toMatchObject({ width: 4, displayFormat: "hex" });
  });
});

describe("schema review fixes: validator strictness", () => {
  it("rejects clock enable values outside the supported enable set", () => {
    const doc = loadSample("01_cycle_signals.tcd.json");
    expect(validateCanonicalDocument(doc)).toEqual([]);
    const clock = doc.signals.find((signal: any) => signal.type === "clock");
    clock.enable = [{ start: 0, value: "banana" }];
    expect(validateCanonicalDocument(doc)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_SIGNAL_VALUE" })]));
  });

  it("accepts the supported clock enable spellings", () => {
    const doc = loadSample("01_cycle_signals.tcd.json");
    const clock = doc.signals.find((signal: any) => signal.type === "clock");
    const period = clock.generator.period as number;
    const values = [1, 0, "1", "0", "true", "false", "high", "low"];
    clock.enable = values.map((value, index) => ({ start: index * period, value }));
    expect(validateCanonicalDocument(doc).filter((problem) => problem.code === "UNSUPPORTED_SIGNAL_VALUE")).toEqual([]);
  });

  it.each([-1, 1.5, 2 ** 53 + 1])("rejects bus value %s that is not a non-negative safe-integer literal", (value) => {
    const doc = loadSample("01_cycle_signals.tcd.json");
    const bus = doc.signals.find((signal: any) => signal.type === "bus");
    bus.width = 4;
    bus.values = [{ start: 0, value }];
    expect(validateCanonicalDocument(doc)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_BUS_LITERAL" })]));
  });

  it("still accepts a bus value that fits the declared width", () => {
    const doc = loadSample("01_cycle_signals.tcd.json");
    const bus = doc.signals.find((signal: any) => signal.type === "bus");
    bus.width = 4;
    bus.values = [{ start: 0, value: 15 }];
    expect(validateCanonicalDocument(doc).filter((problem) => problem.code === "BUS_WIDTH_OVERFLOW" || problem.code === "INVALID_BUS_LITERAL")).toEqual([]);
  });

  it("rejects a Ghost Trace whose source signal is a comment row", () => {
    const doc = loadSample("01_cycle_signals.tcd.json");
    const commentRow = doc.signals.find((signal: any) => signal.type === "commentRow");
    const timing = doc.signals.find((signal: any) => signal.type === "binary");
    doc.annotations.push({
      id: "ann_ghost_comment_source",
      type: "ghostTrace",
      label: "g",
      visible: true,
      start: { signalId: timing.id, cycle: 1, point: "cycle-start", offset: { x: 0, y: 0 } },
      end: { signalId: timing.id, cycle: 3, point: "cycle-start", offset: { x: 0, y: 0 } },
      sourceSignalId: commentRow.id,
    });
    expect(validateCanonicalDocument(doc)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "NON_TIMING_ANCHOR_TARGET", path: expect.stringContaining("sourceSignalId") })]));
  });
});
