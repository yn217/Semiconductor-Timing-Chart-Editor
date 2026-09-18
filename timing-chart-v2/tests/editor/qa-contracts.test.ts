import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateEvidence } from "../../scripts/check-fix-evidence.mjs";
import { validateJourney } from "../../scripts/check-journey-contracts.mjs";

const json = async (path: string) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

describe("QA journey and evidence contracts", () => {
  it("accepts the valid production-path journey and rejects missing FreshStart", async () => {
    expect(validateJourney(await json("../../qa/journeys/feature-example.valid.json"))).toEqual([]);
    expect(validateJourney(await json("../../qa/journeys/invalid.missing-fresh-start.json"))).toContain("freshStart must be true");
  });

  it("requires red-before, root cause, and verifier evidence for bug fixes", async () => {
    expect(validateEvidence(await json("../../qa/evidence/bug-fix-example.valid.json"))).toEqual([]);
    const noObservedRed = await json("../../qa/evidence/bug-fix-example.valid.json");
    noObservedRed.failingTest.observedRed = false;
    expect(validateEvidence(noObservedRed)).toContain("bug-fix failingTest.observedRed must be true");
    const unreproduced = await json("../../qa/evidence/bug-fix-example.valid.json");
    unreproduced.reproduction.status = "not-reproduced";
    expect(validateEvidence(unreproduced)).toContain("bug-fix reproduction.status must be reproduced or intermittent");
    const unverified = await json("../../qa/evidence/bug-fix-example.valid.json");
    unverified.verification.independent = false;
    expect(validateEvidence(unverified)).toContain("bug-fix verification.independent must be true");
    const invalid = await json("../../qa/evidence/invalid.missing-red-root-verifier.json");
    const errors = validateEvidence(invalid);
    expect(errors).toContain("commit must be a 7-40 character lowercase Git SHA");
    expect(errors).toContain("failingTest must be an object");
    expect(errors).toContain("rootCause must be an object");
    expect(errors).toContain("verification.independent must be boolean");
    expect(errors).toContain("verification.productionPath must be boolean");
  });

  it("does not require bug reproduction artifacts for feature work", async () => {
    expect(validateEvidence(await json("../../qa/evidence/feature-example.valid.json"))).toEqual([]);
  });
});
