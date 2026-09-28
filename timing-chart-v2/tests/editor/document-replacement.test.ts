import { describe, expect, it } from "vitest";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { parseDocument } from "@timing-chart-v2/schema";
import { commitDocumentReplacement, type DocumentReplacementPort } from "../../apps/editor/src/application/document-replacement.js";

const small = () => generatePerformanceDocument({ signalCount: 2, cycleCount: 8, profile: "transaction-heavy" });
const session = { marker: "new-session" } as never;

function port(overrides: Partial<DocumentReplacementPort> = {}) {
  const calls: string[] = [];
  const value: DocumentReplacementPort = {
    replaceSession: () => { calls.push("replaceSession"); return session; },
    advanceEpoch: () => { calls.push("advanceEpoch"); return 7; },
    ...overrides,
  };
  return { value, calls };
}

// #743: the production replacement path (commitDocumentReplacement is what use-document-lifecycle calls) with injected failures.
describe("commitDocumentReplacement (#743)", () => {
  it("advances the epoch exactly once and only after the session replacement succeeded", () => {
    const { value, calls } = port();
    const outcome = commitDocumentReplacement(value, small());
    expect(outcome.ok).toBe(true);
    expect(calls).toEqual(["replaceSession", "advanceEpoch"]);
    if (outcome.ok) { expect(outcome.documentEpoch).toBe(7); expect(outcome.session).toBe(session); }
  });

  it("accepts the parser-validated Open handoff without changing the replacement contract", () => {
    const parsed = parseDocument(JSON.stringify(small()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { value, calls } = port();

    const outcome = commitDocumentReplacement(value, parsed);

    expect(outcome.ok).toBe(true);
    expect(calls).toEqual(["replaceSession", "advanceEpoch"]);
  });

  it("a throwing replaceSession leaves the epoch untouched and reports the failure instead of throwing", () => {
    const boom = new Error("session exploded");
    const { value, calls } = port({ replaceSession: () => { calls.push("replaceSession"); throw boom; } });
    const outcome = commitDocumentReplacement(value, small());
    expect(outcome).toEqual({ ok: false, reason: "session-replacement-failed", error: boom });
    expect(calls).toEqual(["replaceSession"]);
    expect(calls).not.toContain("advanceEpoch");
  });

  it("a resource-budget failure never reaches the session or the epoch", () => {
    const { value, calls } = port();
    const huge = { ...small(), timeline: { ...small().timeline, cycleCount: 100_001 } } as ReturnType<typeof small>;
    const outcome = commitDocumentReplacement(value, huge);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("resource-budget");
    expect(calls).toEqual([]);
  });

  it("maps migration warnings to indexed session diagnostics and never advances twice across repeated commits", () => {
    let received: readonly { path: string }[] = [];
    let epoch = 0;
    const value: DocumentReplacementPort = { replaceSession: (_input, diagnostics) => { received = diagnostics; return session; }, advanceEpoch: () => ++epoch };
    commitDocumentReplacement(value, small(), [{ code: "W", path: "$.a", message: "m" }]);
    expect(received.map((item) => item.path)).toEqual(["$.a[migration:0]"]);
    commitDocumentReplacement(value, small());
    expect(epoch).toBe(2);
  });
});
