import { describe, expect, it } from "vitest";
import {
  CANONICAL_PROBLEM_CODES,
  canonicalRuleDescriptor,
  canonicalRuleDescriptors,
  canonicalValidationCodes,
  validateCanonicalDocument,
} from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("canonical validation problem-code contract", () => {
  it("exports one typed inventory and descriptors for representative canonical faults", () => {
    expect(canonicalValidationCodes()).toEqual(CANONICAL_PROBLEM_CODES);
    expect(canonicalRuleDescriptors().every((descriptor) => canonicalValidationCodes().includes(descriptor.code))).toBe(true);
    expect(canonicalRuleDescriptors().every((descriptor) => descriptor.owner === "canonical-validator" && descriptor.severity === "error" && descriptor.pathPattern.length > 0)).toBe(true);
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
});
