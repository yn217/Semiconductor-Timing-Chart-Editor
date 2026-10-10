import { describe, expect, it } from "vitest";
import type { DocumentProblem } from "@timing-chart-v2/schema";
import { diagnosticMatchesIds, parseLatencyCycleBounds } from "../../apps/editor/src/review-workflow.js";

function problem(overrides: Partial<DocumentProblem>): DocumentProblem {
  return { code: "TEST", message: "test", path: "$.signals[0]", severity: "error", ...overrides } as DocumentProblem;
}

describe("Review scope matching", () => {
  it("does not match a short scoped ID against unrelated schema keys in a finding path", () => {
    const constraintFinding = problem({ objectId: "constraint_ok", path: "$.constraints[0].data.requestSignalId" });
    expect(diagnosticMatchesIds(constraintFinding, new Set(["req"]))).toBe(false);
    expect(diagnosticMatchesIds(constraintFinding, new Set(["data"]))).toBe(false);
    expect(diagnosticMatchesIds(constraintFinding, new Set(["requestSignalId"]))).toBe(false);
  });

  it("matches a finding by its exact objectId or entityId", () => {
    expect(diagnosticMatchesIds(problem({ entityId: "sig_req" }), new Set(["sig_req"]))).toBe(true);
    expect(diagnosticMatchesIds(problem({ objectId: "constraint_a" }), new Set(["constraint_a"]))).toBe(true);
    expect(diagnosticMatchesIds(problem({ entityId: "sig_req_2" }), new Set(["sig_req"]))).toBe(false);
  });

  it("includes a constraint finding when a Signal the constraint references is scoped", () => {
    const constraintSignals = new Map([["constraint_ok", new Set(["sig_req", "sig_reset"])]]);
    const finding = problem({ objectId: "constraint_ok", path: "$.constraints[0]" });
    expect(diagnosticMatchesIds(finding, new Set(["sig_reset"]), constraintSignals)).toBe(true);
    expect(diagnosticMatchesIds(finding, new Set(["sig_other"]), constraintSignals)).toBe(false);
  });

  it("matches nothing when the scope is empty", () => {
    expect(diagnosticMatchesIds(problem({ entityId: "sig_req" }), new Set())).toBe(false);
  });
});

describe("Latency cycle bound parsing", () => {
  it("accepts integer bounds with 0 <= minimum <= maximum", () => {
    expect(parseLatencyCycleBounds("0", "0")).toEqual({ ok: true, minimum: 0, maximum: 0 });
    expect(parseLatencyCycleBounds("1", "3")).toEqual({ ok: true, minimum: 1, maximum: 3 });
  });

  it("rejects blank bounds instead of reading them as 0", () => {
    expect(parseLatencyCycleBounds("", "3")).toMatchObject({ ok: false, message: "Enter both minimum and maximum cycles." });
    expect(parseLatencyCycleBounds("1", "   ")).toMatchObject({ ok: false, message: "Enter both minimum and maximum cycles." });
  });

  it("rejects non-integer, negative, and inverted bounds", () => {
    for (const [minimum, maximum] of [["1.5", "3"], ["-1", "3"], ["4", "3"], ["abc", "3"]] as const) {
      expect(parseLatencyCycleBounds(minimum, maximum)).toMatchObject({ ok: false });
    }
  });
});
