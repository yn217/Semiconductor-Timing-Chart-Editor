import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = (value, keys, label) => {
  const missing = keys.filter((key) => !(key in value));
  if (missing.length) throw new Error(`${label}: missing ${missing.join(", ")}`);
};
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const checkJourney = (journey, label) => {
  required(journey, ["id", "relatedIssue", "preconditions", "actions", "expected", "invariants", "freshStart", "productionPath"], label);
  if (!journey.id || !Number.isInteger(journey.relatedIssue) || journey.preconditions.length < 1 || journey.actions.length < 1 || journey.expected.length < 1 || Object.keys(journey.invariants).length < 1) throw new Error(`${label}: incomplete journey`);
  if (journey.freshStart !== true || journey.productionPath !== true) throw new Error(`${label}: freshStart and productionPath must be true`);
};
const checkEvidence = (evidence, label) => {
  required(evidence, ["issue", "commit", "reproduction", "failingTest", "rootCause", "verification"], label);
  required(evidence.reproduction, ["status", "journey"], `${label}.reproduction`);
  required(evidence.failingTest, ["name", "observedRed"], `${label}.failingTest`);
  required(evidence.rootCause, ["bugClass", "violatedInvariant"], `${label}.rootCause`);
  required(evidence.verification, ["independent", "freshStart", "productionPath"], `${label}.verification`);
  if (!Number.isInteger(evidence.issue) || !/^[0-9a-f]{7,40}$/.test(evidence.commit) || evidence.reproduction.status !== "confirmed" || evidence.failingTest.observedRed !== true || evidence.verification.independent !== true || evidence.verification.freshStart !== true || evidence.verification.productionPath !== true) throw new Error(`${label}: invalid evidence contract`);
};
checkJourney(readJson("qa/journeys/example-valid.json"), "example-valid journey");
checkEvidence(readJson("qa/evidence/example-valid.json"), "example-valid evidence");
const expectInvalid = (check, value, label) => {
  try { check(value, label); } catch { return; }
  throw new Error(`${label}: invalid fixture was accepted`);
};
expectInvalid(checkJourney, readJson("qa/journeys/example-invalid.json"), "example-invalid journey");
expectInvalid(checkEvidence, readJson("qa/evidence/example-invalid.json"), "example-invalid evidence");
console.log("fix-evidence: valid and invalid examples PASS");
