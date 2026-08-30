import { describe, expect, it } from "vitest";
import { canonicalFixture } from "../fixtures/canonical.js";
import { parseBulkSignalDefinitions } from "../../apps/editor/src/bulk-signal-parser.js";

describe("parseBulkSignalDefinitions", () => {
  it("parses hierarchical signals and bus widths", () => {
    const result = parseBulkSignalDefinitions("dut.ctrl.enable binary\ndut.data[7:0] bus", canonicalFixture());
    expect(result.errors).toEqual([]);
    expect(result.definitions).toMatchObject([
      { path: "dut.ctrl.enable", signalName: "enable", instancePath: ["dut", "ctrl"] },
      { path: "dut.data[7:0]", signalName: "data[7:0]", width: 8 },
    ]);
  });

  it("reports malformed, unsupported, and duplicate definitions", () => {
    const result = parseBulkSignalDefinitions("dut.a binary\ndut.a output\ndut.data bus\ndut.b[1:0] binary", canonicalFixture());
    expect(result.definitions).toHaveLength(1);
    expect(result.errors).toEqual([
      "Line 2: unsupported signal type 'output'.",
      "Line 3: bus signal 'dut.data' must include a bit range such as [31:0].",
      "Line 4: only bus signals may include a bit range.",
    ]);
  });

  it("rejects invalid instance path segments before canonical creation", () => {
    const result = parseBulkSignalDefinitions("dut.bad-name.signal binary\ndut.2core.signal binary", canonicalFixture());
    expect(result.definitions).toEqual([]);
    expect(result.errors).toEqual([
      "Line 1: invalid signal path 'dut.bad-name.signal'.",
      "Line 2: invalid signal path 'dut.2core.signal'.",
    ]);
  });
});
