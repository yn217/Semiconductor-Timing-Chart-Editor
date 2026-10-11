import { describe, expect, it } from "vitest";
import type { Signal, SignalId } from "@timing-chart-v2/schema";
import type { VcdVariable } from "../../apps/editor/src/simulation/vcd-text-parser.js";
import { mapVcdVariablesToSignals } from "../../apps/editor/src/simulation/signal-mapping.js";

function signal(id: string, signalName: string, instancePath: readonly string[] = ["top", "cpu"]): Signal {
  return {
    id: id as SignalId,
    type: "binary",
    name: signalName,
    role: "internal",
    source: { instancePath, signalName },
    display: { name: signalName },
    values: [],
  };
}

function variable(reference: string, scope: readonly string[] = ["top", "cpu"], code = "!"): VcdVariable {
  return { code, kind: "wire", width: 1, reference, scope, hierarchicalName: [...scope, reference].join(".") };
}

describe("mapVcdVariablesToSignals", () => {
  it("matches exact complete hierarchy and exact name-only fallback", () => {
    const result = mapVcdVariablesToSignals(
      [signal("hier", "ready"), signal("flat-canonical", "done", []), signal("hier-canonical", "complete")],
      [variable("ready"), variable("done", ["top", "cpu"], "\""), variable("complete", [], "#")],
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mappings.map(({ status, signalId }) => [status, signalId])).toEqual([
      ["matched", "hier"], ["matched", "flat-canonical"], ["matched", "hier-canonical"],
    ]);
  });

  it("leaves duplicate canonical and duplicate VCD candidates unresolved", () => {
    const result = mapVcdVariablesToSignals(
      [signal("a", "ready", ["top", "a"]), signal("b", "ready", ["top", "a"]), signal("c", "shared", [])],
      [variable("ready", ["top", "a"]), variable("shared", ["top", "x"], "\""), variable("shared", ["top", "y"], "#")],
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mappings.map(({ status, reason }) => [status, reason])).toEqual([
      ["ambiguous", "multiple-canonical-candidates"],
      ["ambiguous", "multiple-vcd-candidates"],
      ["ambiguous", "multiple-vcd-candidates"],
    ]);
  });

  it("keeps large ambiguous mappings unresolved across distinct hierarchy scopes", () => {
    const signals = Array.from({ length: 512 }, (_, index) => signal(`ready-${index}`, "ready", []));
    const variables = Array.from({ length: 512 }, (_, index) => variable("ready", ["top", `missing-block-${index}`], `code-${index}`));
    const result = mapVcdVariablesToSignals(signals, variables);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mappings).toHaveLength(512);
    expect(result.mappings.every(({ status }) => status === "ambiguous")).toBe(true);
    expect(result.mappings.every(({ signalId }) => signalId === undefined)).toBe(true);
  });

  it("does not case-normalize and reports absent names as missing", () => {
    const result = mapVcdVariablesToSignals([signal("a", "Ready")], [variable("ready"), variable("other", [], "\"")]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.mappings.map(({ status }) => status)).toEqual(["missing", "missing"]);
  });

  it("never maps comment rows and enforces the document signal budget", () => {
    const comment: Signal = {
      id: "note" as SignalId,
      type: "commentRow",
      name: "note",
      role: "internal",
      source: { instancePath: ["top", "cpu"], signalName: "ready" },
      display: { name: "note" },
      title: "note",
      body: "text",
    };
    expect(mapVcdVariablesToSignals([comment], [variable("ready")])).toMatchObject({
      status: "ok", mappings: [{ status: "missing" }],
    });
    expect(mapVcdVariablesToSignals(Array.from({ length: 10_001 }, (_, index) => signal(String(index), `s${index}`)), [])).toMatchObject({ status: "resource-limit" });
  });
});
