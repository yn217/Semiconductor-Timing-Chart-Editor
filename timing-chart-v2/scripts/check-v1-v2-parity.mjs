import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : fallback;
};
const matrixPath = argumentValue("--matrix", path.join(root, "docs", "v1-v2-parity.json"));
const sourceManifestPath = argumentValue("--manifest", path.join(root, "docs", "v1-v2-source-manifest.json"));
const statusPath = argumentValue("--status", path.join(root, "docs", "v1-v2-contract-status.json"));
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const statusModel = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const requiredFields = [
  "v1Source", "requirement", "decision", "v2OwnerIssue", "canonicalOwner",
  "commandOwner", "viewOwner", "exportOwner", "unit", "e2e", "visual",
  "saveOpen", "performance", "notes"
];
const fail = (message) => { throw new Error(`[v1-v2-parity] ${message}`); };

if (matrix.schemaVersion !== 1) fail("unsupported schemaVersion");
if (sourceManifest.schemaVersion !== 1 || !Array.isArray(sourceManifest.issues)) fail("invalid V1 source manifest");
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
const manifestIssues = sourceManifest.issues;
if (new Set(manifestIssues).size !== manifestIssues.length) fail("duplicate source-manifest issue number");
if (manifestIssues.some((number) => !Number.isInteger(number) || number <= 0 || number >= 161)) fail("source manifest contains an invalid pre-V2 number");
const sortedIssues = (issues) => [...issues].sort((left, right) => left - right);
const missingFromMatrix = manifestIssues.filter((issue) => !coverage.includes(issue));
const staleMatrixIssues = coverage.filter((issue) => !manifestIssues.includes(issue));
if (missingFromMatrix.length || staleMatrixIssues.length) fail(`source-universe mismatch: missingFromMatrix=${missingFromMatrix.join(",") || "none"}, staleMatrixIssues=${staleMatrixIssues.join(",") || "none"}`);
if (JSON.stringify(sortedIssues(manifestIssues)) !== JSON.stringify(sortedIssues(coverage))) fail("source-manifest and matrix coverage ordering/content differ");
const allRows = [...matrix.requirements, ...matrix.independentContracts];
const rowIds = new Set(allRows.map(({ id }) => id));
const allowedStatuses = new Set(["NOT_IMPLEMENTED", "PARTIAL", "ACCEPTANCE_ONLY", "BLOCKED_EXTERNAL", "COMPLETE"]);
if (statusModel.schemaVersion !== 1 || !Array.isArray(statusModel.contracts) || !statusModel.evidenceClassFields) fail("invalid contract status model");
const statusRows = statusModel.contracts;
if (statusRows.length !== matrix.independentContracts.length) fail(`contract status count mismatch: ${statusRows.length} != ${matrix.independentContracts.length}`);
const statusByFeature = new Map();
for (const statusRow of statusRows) {
  if (!statusRow.featureKey || statusByFeature.has(statusRow.featureKey)) fail(`duplicate or empty featureKey: ${statusRow.featureKey}`);
  if (!allowedStatuses.has(statusRow.implementationStatus)) fail(`${statusRow.featureKey} has invalid implementationStatus`);
  statusByFeature.set(statusRow.featureKey, statusRow);
}
const evidenceFields = Object.values(statusModel.evidenceClassFields);
if (evidenceFields.length !== new Set(evidenceFields).size || !evidenceFields.includes("implementationEvidence")) fail("invalid evidence class field mapping");
const completeEvidenceFields = ["implementationEvidence", "unit", "e2e", "visual", "export"];
const concrete = (value) => typeof value === "string" && value.trim().length > 0 && !/^N\/A(?: |$)/.test(value.trim());
for (const contract of matrix.independentContracts) {
  const statusRow = statusByFeature.get(contract.id);
  if (!statusRow) fail(`${contract.id} has no feature identity/status row`);
  const ownerIssues = String(contract.v2OwnerIssue).split("/");
  if (JSON.stringify(statusRow.legacySources) !== JSON.stringify(contract.v1Source) || JSON.stringify(statusRow.ownerIssues) !== JSON.stringify(ownerIssues)) fail(`${contract.id} identity/source owner mismatch`);
  if (!statusRow.legacySources.every((source) => typeof source === "string" && source.startsWith("#"))) fail(`${contract.id} has invalid legacy source identity`);
  if (statusRow.implementationStatus === "ACCEPTANCE_ONLY" && !concrete(contract.implementationEvidence)) fail(`${contract.id} ACCEPTANCE_ONLY requires concrete production evidence`);
  if (statusRow.implementationStatus === "BLOCKED_EXTERNAL" && !concrete(statusRow.externalDependency)) fail(`${contract.id} BLOCKED_EXTERNAL requires a named external dependency`);
  if (statusRow.implementationStatus === "COMPLETE" && completeEvidenceFields.some((field) => !concrete(contract[field]))) fail(`${contract.id} COMPLETE requires ${completeEvidenceFields.join(", ")} evidence`);
  if (contract.id === "GUI-SIGNAL-SPLIT") {
    if (statusRow.implementationStatus !== "NOT_IMPLEMENTED" || !contract.v1Source.includes("#98") || contract.v2OwnerIssue !== "#200") fail("GUI-SIGNAL-SPLIT identity/status is not the #98/#200 contract");
    if (!/^No production Upper\/Lower\/Both Signal Split path is present;/.test(contract.implementationEvidence)) fail("GUI-SIGNAL-SPLIT evidence must not use Cycle/Transaction Split as implementation evidence");
  }
}
const missingStatusRows = matrix.independentContracts.filter(({ id }) => !statusByFeature.has(id));
if (missingStatusRows.length) fail(`status model has missing feature rows: ${missingStatusRows.map(({ id }) => id).join(",")}`);
const independentFields = ["v1Source", "requirement", "decision", "v2OwnerIssue", "acceptance", "implementationEvidence", "unit", "e2e", "visual", "export", "status"];
for (const contract of matrix.independentContracts) {
  for (const field of independentFields) if (!(field in contract)) fail(`${contract.id} is missing ${field}`);
  if (!["KEEP", "MERGED", "DEFER", "DROP"].includes(contract.decision)) fail(`${contract.id} has invalid decision`);
  if (contract.decision === "DROP" || contract.decision === "DEFER") fail(`${contract.id} uses forbidden unapproved ${contract.decision}`);
  if (!contract.v2OwnerIssue || !contract.acceptance || !contract.implementationEvidence) fail(`${contract.id} lacks owner/acceptance/implementation evidence`);
}
if (!Array.isArray(matrix.legacyIssueAssignments)) fail("legacyIssueAssignments is missing");
const assigned = new Map();
const assignments = [...matrix.legacyIssueAssignments, ...(matrix.additionalLegacyIssueAssignments ?? [])];
for (const assignment of assignments) {
  if (!Number.isInteger(assignment.issue) || !rowIds.has(assignment.contractId)) fail(`invalid issue assignment ${JSON.stringify(assignment)}`);
  assigned.set(assignment.issue, (assigned.get(assignment.issue) ?? 0) + 1);
}
const unmapped = coverage.filter((issue) => !assigned.has(issue));
if (unmapped.length !== 0) fail(`UNMAPPED_LEGACY_ISSUE=${unmapped.length}: ${unmapped.join(",")}`);
const unknownAssignments = [...assigned.keys()].filter((issue) => !manifestIssues.includes(issue));
if (unknownAssignments.length !== 0) fail(`assignment references issue outside source manifest: ${unknownAssignments.join(",")}`);
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
for (const requirement of allRows) {
  if (requirement.decision === "KEEP" && (!requirement.v2OwnerIssue || !String(requirement.v2OwnerIssue).trim())) fail(`${requirement.id} is KEEP without V2 owner`);
  if (requirement.decision === "DEFER" && (!requirement.v2OwnerIssue || !String(requirement.v2OwnerIssue).trim() || !String(requirement.notes ?? "").trim())) fail(`${requirement.id} is DEFER without owner/reason`);
}
if (matrix.decisionPolicy.dropCount !== 0 || matrix.decisionPolicy.deferCount !== 0) fail("decision policy counts are not zero");
if (allRows.some(({ decision }) => decision === "DROP" || decision === "DEFER")) fail("inventory contains DROP/DEFER despite zero policy");

const counts = Object.fromEntries(["KEEP", "MERGED", "DEFER", "DROP"].map((decision) => [decision, allRows.filter((row) => row.decision === decision).length]));
const statusCounts = Object.fromEntries([...allowedStatuses].map((status) => [status, statusRows.filter((row) => row.implementationStatus === status).length]));
console.log(`V1/V2 parity inventory passed: ${allRows.length} contract rows (${matrix.requirements.length} grouped + ${matrix.independentContracts.length} independent), ${manifestIssues.length} manifest issues == ${coverage.length} matrix issues, UNCLASSIFIED=0, UNMAPPED_LEGACY_ISSUE=0, UNKNOWN_V2_OWNER=0, GUI-01..GUI-16 missing=0, conflicting decision=0, KEEP=${counts.KEEP}, MERGED=${counts.MERGED}, DEFER=${counts.DEFER}, DROP=${counts.DROP}, implementationStatus=${JSON.stringify(statusCounts)}.`);
