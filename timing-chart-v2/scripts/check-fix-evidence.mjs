#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const validKinds = new Set(["bug-fix", "feature", "maintenance"]);
const hexCommit = /^[0-9a-f]{7,40}$/;
const issueId = /^#[1-9][0-9]*$/;

function requireObject(value, path, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function requireText(value, path, errors) {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${path} must be a non-empty string`);
}

export function validateEvidence(manifest) {
  const errors = [];
  if (!requireObject(manifest, "manifest", errors)) return errors;
  if (typeof manifest.issue !== "string" || !issueId.test(manifest.issue)) errors.push("issue must be a GitHub issue reference such as #123");
  if (typeof manifest.commit !== "string" || !hexCommit.test(manifest.commit)) errors.push("commit must be a 7-40 character lowercase Git SHA");
  if (!validKinds.has(manifest.changeKind)) errors.push("changeKind must be bug-fix, feature, or maintenance");

  if (manifest.changeKind === "bug-fix") {
    if (requireObject(manifest.reproduction, "reproduction", errors)) {
      if (!["reproduced", "intermittent", "not-reproduced", "not-applicable"].includes(manifest.reproduction.status)) errors.push("reproduction.status is invalid");
      requireText(manifest.reproduction.journey, "reproduction.journey", errors);
    }
    if (requireObject(manifest.failingTest, "failingTest", errors)) {
      requireText(manifest.failingTest.name, "failingTest.name", errors);
      if (typeof manifest.failingTest.observedRed !== "boolean") errors.push("failingTest.observedRed must be boolean");
    }
    if (requireObject(manifest.rootCause, "rootCause", errors)) {
      requireText(manifest.rootCause.bugClass, "rootCause.bugClass", errors);
      requireText(manifest.rootCause.violatedInvariant, "rootCause.violatedInvariant", errors);
    }
  }

  if (requireObject(manifest.verification, "verification", errors)) {
    for (const field of ["independent", "freshStart", "productionPath"]) {
      if (typeof manifest.verification[field] !== "boolean") errors.push(`verification.${field} must be boolean`);
    }
    requireText(manifest.verification.result, "verification.result", errors);
    if (manifest.verification.evidenceRefs !== undefined && (!Array.isArray(manifest.verification.evidenceRefs) || manifest.verification.evidenceRefs.some((ref) => typeof ref !== "string"))) errors.push("verification.evidenceRefs must be an array of strings");
  }
  if (manifest.changeKind === "bug-fix" && manifest.verification && typeof manifest.verification === "object") {
    for (const field of ["independent", "freshStart", "productionPath"]) {
      if (manifest.verification[field] !== true) errors.push(`bug-fix verification.${field} must be true`);
    }
  }
  return errors;
}

export async function checkEvidenceFiles(paths) {
  const failures = [];
  for (const path of paths) {
    try {
      const manifest = JSON.parse(await readFile(path, "utf8"));
      const errors = validateEvidence(manifest);
      if (errors.length) failures.push(`${path}: ${errors.join("; ")}`);
    } catch (error) {
      failures.push(`${path}: ${error.message}`);
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.log("No evidence manifests supplied; non-bug PRs are not required to fabricate one.");
    process.exit(0);
  }
  const failures = await checkEvidenceFiles(paths);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`Fix Evidence Gate: ${paths.length} manifest(s) structurally valid. This does not verify semantic correctness.`);
}
