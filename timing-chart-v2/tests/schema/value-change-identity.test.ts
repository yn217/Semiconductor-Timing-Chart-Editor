import { describe, expect, it } from "vitest";
import { canonicalFixture } from "../fixtures/canonical.js";
import { parseDocument, serializeCanonicalDocument } from "@timing-chart-v2/schema";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("Signal value-change identity at document boundaries", () => {
  it("assigns deterministic collision-free IDs to missing v2 changes and preserves them through Save/Open", () => {
    const source = clone(canonicalFixture());
    const data = source.signals.find((signal) => signal.id === "sig_data");
    const clock = source.signals.find((signal) => signal.id === "sig_clk");
    if (!data || data.type === "clock" || !clock || clock.type !== "clock") throw new Error("canonical fixture signals are missing");
    (data as { values: Array<{ id?: string; start: number; value: string | number }> }).values = [
      { start: 0, value: "00" },
      { id: "existing-change-id", start: 4, value: "A5" },
    ];
    (clock as { enable?: Array<{ id?: string; start: number; value: string | number }> }).enable = [{ start: 0, value: 1 }];

    const first = parseDocument(source);
    const second = parseDocument(source);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const readIds = (document: typeof first.document) => document.signals.flatMap((signal) =>
      signal.type === "clock" ? (signal.enable ?? []).map((change) => change.id) : "values" in signal ? signal.values.map((change) => change.id) : [],
    );
    const ids = readIds(first.document);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(readIds(second.document)).toEqual(ids);
    expect(ids).toContain("existing-change-id");
    expect(first.warnings).toContainEqual(expect.objectContaining({ code: "MIGRATED_VALUE_CHANGE_IDS" }));

    const reopened = parseDocument(serializeCanonicalDocument(first.document));
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(readIds(reopened.document)).toEqual(ids);
  });

  it("rejects explicitly duplicated IDs in v2 import before runtime entry", () => {
    const source = clone(canonicalFixture());
    const data = source.signals.find((signal) => signal.id === "sig_data");
    if (!data || data.type === "clock") throw new Error("canonical fixture data signal is missing");
    (data as { values: Array<{ id: string; start: number; value: string | number }> }).values = [
      { id: "duplicate-change", start: 0, value: "00" },
      { id: "duplicate-change", start: 4, value: "A5" },
    ];

    const imported = parseDocument(source);
    expect(imported.ok).toBe(false);
    if (!imported.ok) expect(imported.problems).toContainEqual(expect.objectContaining({ code: "DUPLICATE_ID", path: "$.signals[1].values[1].id" }));
  });
});
