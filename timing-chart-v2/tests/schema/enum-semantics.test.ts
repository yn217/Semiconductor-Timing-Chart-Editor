import { describe, expect, it } from "vitest";
import { resolveEnumValue, validateEnumDefinition } from "@timing-chart-v2/schema";

describe("enum semantic resolver", () => {
  const definition = { id: "state.main", name: "Main", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "WAIT" }] } as const;
  it("resolves numeric values and preserves unmapped values", () => {
    expect(resolveEnumValue(definition, 1)).toBe("WAIT");
    expect(resolveEnumValue(definition, 7)).toBe("7");
    expect(resolveEnumValue(definition, "X")).toBe("X");
  });
  it("rejects duplicate values and labels", () => {
    expect(validateEnumDefinition({ ...definition, entries: [{ value: 0, label: "IDLE" }, { value: 0, label: "ZERO" }] })).toContain("unique");
    expect(validateEnumDefinition({ ...definition, entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "IDLE" }] })).toContain("unique");
    expect(validateEnumDefinition(definition)).toBeUndefined();
  });
});
