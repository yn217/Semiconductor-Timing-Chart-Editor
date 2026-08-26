import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const matrixPath = path.join(root, "docs", "v1-v2-parity.json");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const requiredFields = [
  "v1Source", "requirement", "decision", "v2OwnerIssue", "canonicalOwner",
  "commandOwner", "viewOwner", "exportOwner", "unit", "e2e", "visual",
  "saveOpen", "performance", "notes"
];
const fail = (message) => { throw new Error(`[v1-v2-parity] ${message}`); };

if (matrix.schemaVersion !== 1) fail("unsupported schemaVersion");
if (!Array.isArray(matrix.requirements) || matrix.requirements.length < 20) fail("requirements inventory is unexpectedly small");
if (!Array.isArray(matrix.independentContracts) || matrix.independentContracts.length < 20) fail("independent contract inventory is incomplete");
if (!Array.isArray(matrix.legacyIssueCoverage) || matrix.legacyIssueCoverage.length < 50) fail("legacy issue universe is incomplete");

const ids = new Set();
for (const requirement of matrix.requirements) {
  if (!requirement.id || ids.has(requirement.id)) fail(`duplicate or empty requirement id: ${requirement.id}`);
  ids.add(requirement.id);
  for (const field of requiredFields) {
    if (!(field in requirement)) fail(`${requirement.id} is missing ${field}`);
  }
  if (!Array.isArray(requirement.v1Source) || requirement.v1Source.length === 0) fail(`${requirement.id} has no V1 source`);
  if (!["KEEP", "MERGED", "DEFER", "DROP"].includes(requirement.decision)) fail(`${requirement.id} has invalid decision`);
  if (requirement.decision === "DROP" || requirement.decision === "DEFER") fail(`${requirement.id} uses forbidden unapproved ${requirement.decision}`);
}

const highRisk = [...Array(16)].map((_, index) => `GUI-${String(index + 1).padStart(2, "0")}`);
for (const id of highRisk) if (!ids.has(id)) fail(`missing high-risk GUI row ${id}`);

const coverage = matrix.legacyIssueCoverage;
if (new Set(coverage).size !== coverage.length) fail("duplicate legacy issue number");
if (coverage.some((number) => !Number.isInteger(number) || number <= 0 || number >= 161)) fail("legacy issue coverage contains an invalid pre-V2 number");
const allRows = [...matrix.requirements, ...matrix.independentContracts];
const rowIds = new Set(allRows.map(({ id }) => id));
const independentFields = ["v1Source", "requirement", "decision", "v2OwnerIssue", "acceptance", "implementationEvidence", "unit", "e2e", "visual", "export", "status"];
for (const contract of matrix.independentContracts) {
  for (const field of independentFields) if (!(field in contract)) fail(`${contract.id} is missing ${field}`);
  if (!["KEEP", "MERGED", "DEFER", "DROP"].includes(contract.decision)) fail(`${contract.id} has invalid decision`);
  if (contract.decision === "DROP" || contract.decision === "DEFER") fail(`${contract.id} uses forbidden unapproved ${contract.decision}`);
  if (!contract.v2OwnerIssue || !contract.acceptance || !contract.implementationEvidence) fail(`${contract.id} lacks owner/acceptance/implementation evidence`);
}
if (!Array.isArray(matrix.legacyIssueAssignments)) fail("legacyIssueAssignments is missing");
const assigned = new Map();
for (const assignment of matrix.legacyIssueAssignments) {
  if (!Number.isInteger(assignment.issue) || !rowIds.has(assignment.contractId)) fail(`invalid issue assignment ${JSON.stringify(assignment)}`);
  assigned.set(assignment.issue, (assigned.get(assignment.issue) ?? 0) + 1);
}
const unmapped = coverage.filter((issue) => !assigned.has(issue));
if (unmapped.length !== 0) fail(`UNMAPPED_LEGACY_ISSUE=${unmapped.length}: ${unmapped.join(",")}`);
const duplicateContractIds = allRows.length - new Set(allRows.map(({ id }) => id)).size;
if (duplicateContractIds !== 0) fail(`duplicate contract ID count=${duplicateContractIds}`);
const unclassified = allRows.filter(({ decision }) => !decision).length;
if (unclassified !== 0) fail(`UNCLASSIFIED=${unclassified}`);
const unknownOwners = allRows.filter(({ v2OwnerIssue }) => !v2OwnerIssue || !String(v2OwnerIssue).trim()).length;
if (unknownOwners !== 0) fail(`UNKNOWN_V2_OWNER=${unknownOwners}`);
const conflicting = allRows.filter(({ decision, status }) => decision === "DROP" && status !== "APPROVED").length;
if (conflicting !== 0) fail(`conflicting decision count=${conflicting}`);
for (const contract of allRows.filter(({ decision }) => decision === "MERGED")) {
  const evidence = [contract.acceptance, contract.implementationEvidence, contract.unit, contract.e2e, contract.visual, contract.export].every(Boolean);
  if (!evidence) fail(`${contract.id} is MERGED without evidence fields`);
}
if (matrix.decisionPolicy.dropCount !== 0 || matrix.decisionPolicy.deferCount !== 0) fail("decision policy counts are not zero");
if (allRows.some(({ decision }) => decision === "DROP" || decision === "DEFER")) fail("inventory contains DROP/DEFER despite zero policy");

const counts = Object.fromEntries(["KEEP", "MERGED", "DEFER", "DROP"].map((decision) => [decision, allRows.filter((row) => row.decision === decision).length]));
console.log(`V1/V2 parity inventory passed: ${allRows.length} contract rows (${matrix.requirements.length} grouped + ${matrix.independentContracts.length} independent), ${coverage.length} legacy issue references, UNCLASSIFIED=0, UNMAPPED_LEGACY_ISSUE=0, UNKNOWN_V2_OWNER=0, GUI-01..GUI-16 missing=0, conflicting decision=0, KEEP=${counts.KEEP}, MERGED=${counts.MERGED}, DEFER=${counts.DEFER}, DROP=${counts.DROP}.`);
