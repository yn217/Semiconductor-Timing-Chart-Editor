import { describe, expect, it } from "vitest";
import {
  CANONICAL_PROBLEM_CODES,
  canonicalRuleDescriptor,
  canonicalRuleDescriptors,
  canonicalValidationCodes,
  documentProblemRuleDescriptor,
  schemaRuleDescriptor,
  schemaRuleDescriptors,
  SCHEMA_RULE_KEYWORDS,
  validateCanonicalDocument,
  canonicalEntityInventory,
  canonicalReferences,
} from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("canonical validation problem-code contract", () => {
  it("exports one typed inventory and descriptors for representative canonical faults", () => {
    expect(canonicalValidationCodes()).toEqual(CANONICAL_PROBLEM_CODES);
    expect(canonicalRuleDescriptors().every((descriptor) => canonicalValidationCodes().includes(descriptor.code) && descriptor.category === "canonical")).toBe(true);
    expect(canonicalRuleDescriptors()).toHaveLength(CANONICAL_PROBLEM_CODES.length);
    expect(new Set(canonicalRuleDescriptors().map((descriptor) => descriptor.code)).size).toBe(CANONICAL_PROBLEM_CODES.length);
    expect(canonicalRuleDescriptors().every((descriptor) => descriptor.owner === "canonical-validator" && descriptor.layer === "canonical-invariant" && descriptor.severity === "error" && descriptor.pathPattern.length > 0 && descriptor.fixability === "none" && descriptor.ruleVersion === 1)).toBe(true);
  });

  it("exports the schema structural keyword inventory separately", () => {
    expect(schemaRuleDescriptors()).toHaveLength(SCHEMA_RULE_KEYWORDS.length);
    expect(new Set(schemaRuleDescriptors().map((descriptor) => descriptor.keyword)).size).toBe(SCHEMA_RULE_KEYWORDS.length);
    expect(schemaRuleDescriptors().every((descriptor) => descriptor.category === "schema" && descriptor.layer === "schema-structural" && descriptor.owner === "schema-ajv" && descriptor.severity === "error" && descriptor.ruleVersion === 1)).toBe(true);
    expect(schemaRuleDescriptor("required")).toMatchObject({ code: "SCHEMA_REQUIRED" });
  });

  it.each([
    ["missing reference", (document: ReturnType<typeof canonicalFixture>) => { (document as unknown as { timeline: { referenceClock: string } }).timeline.referenceClock = "sig_missing"; }, "MISSING_CROSS_REFERENCE", "$.timeline.referenceClock", "fixture"],
    ["bus width overflow", (document: ReturnType<typeof canonicalFixture>) => { (document.signals[1] as unknown as { values: Array<{ value: string }> }).values[1]!.value = "1FF"; }, "BUS_WIDTH_OVERFLOW", "$.signals[1].values[1].value", "sig_data"],
    ["duplicate id", (document: ReturnType<typeof canonicalFixture>) => { (document.signals[1] as unknown as { id: string }).id = "sig_clk"; }, "DUPLICATE_ID", "$.signals[1].id", "sig_clk"],
  ])("reports stable code, path, and entity context for %s", (_name, mutate, code, path, entityId) => {
    const document = structuredClone(canonicalFixture());
    mutate(document);
    const problem = validateCanonicalDocument(document).find((item) => item.code === code);
    expect(problem).toMatchObject({ code, path, entityId });
    expect(canonicalRuleDescriptor(code as typeof CANONICAL_PROBLEM_CODES[number])).toBeDefined();
  });

  it("resolves problem codes to metadata without parsing messages", () => {
    expect(documentProblemRuleDescriptor("DUPLICATE_ID")).toMatchObject({ category: "canonical", owner: "canonical-validator", layer: "canonical-invariant", severity: "error", fixability: "none" });
    expect(documentProblemRuleDescriptor("SCHEMA_REQUIRED")).toMatchObject({ category: "schema", owner: "schema-ajv", layer: "schema-structural", severity: "error" });
    expect(documentProblemRuleDescriptor("JSON_SYNTAX")).toBeUndefined();
  });

  it("keeps every stable-ID entity kind in one shared inventory", () => {
    const document = structuredClone(canonicalFixture());
    (document as unknown as { enumDefinitions: Array<{ id: string; name: string; entries: never[] }> }).enumDefinitions = [{ id: "enum_phase", name: "Phase", entries: [] }];
    const inventory = canonicalEntityInventory(document);
    expect(inventory.find((entry) => entry.id === "enum_phase")).toMatchObject({ kind: "enumDefinition", path: "$.enumDefinitions[0].id" });
    expect(new Set(inventory.map((entry) => entry.id)).size).toBe(inventory.length);
  });

  it("emits dangling enum references for the canonical validator to diagnose", () => {
    const document = structuredClone(canonicalFixture());
    const signal = document.signals.find((item) => item.type !== "clock" && item.type !== "commentRow");
    if (!signal || signal.type === "clock" || signal.type === "commentRow") throw new Error("fixture must contain a non-clock signal");
    (signal as unknown as { enumId: string }).enumId = "enum_missing";
    expect(canonicalReferences(document)).toContainEqual(expect.objectContaining({ kind: "signal.enum", targetId: "enum_missing", path: expect.stringContaining("enumId") }));
    expect(validateCanonicalDocument(document)).toContainEqual(expect.objectContaining({ code: "MISSING_CROSS_REFERENCE", entityId: signal.id }));
  });
});
