#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const issueId = /^#[1-9][0-9]*$/;

export function validateJourney(journey) {
  const errors = [];
  if (!journey || typeof journey !== "object" || Array.isArray(journey)) return ["journey must be an object"];
  const text = (value, field) => { if (typeof value !== "string" || value.trim() === "") errors.push(`${field} must be a non-empty string`); };
  text(journey.id, "id");
  for (const field of ["preconditions", "actions", "expectedVisibleResult"]) {
    if (!Array.isArray(journey[field])) errors.push(`${field} must be an array`);
    else if (field !== "preconditions" && journey[field].length === 0) errors.push(`${field} must contain at least one item`);
    else if (journey[field].some((item) => typeof item !== "string" || item.trim() === "")) errors.push(`${field} items must be non-empty strings`);
  }
  const invariants = journey.invariants;
  if (!invariants || typeof invariants !== "object" || Array.isArray(invariants)) errors.push("invariants must be an object");
  else for (const field of ["canonical", "history", "dirty"]) text(invariants[field], `invariants.${field}`);
  for (const field of ["freshStart", "productionPath"]) if (journey[field] !== true) errors.push(`${field} must be true`);
  if (typeof journey.relatedIssue !== "string" || !issueId.test(journey.relatedIssue)) errors.push("relatedIssue must be a GitHub issue reference such as #123");
  for (const field of ["geometryAssertions", "domRelations"]) {
    if (journey[field] !== undefined && (!Array.isArray(journey[field]) || journey[field].some((entry) => !entry || typeof entry.description !== "string" || typeof entry.evidenceRef !== "string"))) errors.push(`${field} entries require description and evidenceRef strings`);
  }
  return errors;
}

async function main(paths) {
  const failures = [];
  for (const path of paths) {
    try {
      const errors = validateJourney(JSON.parse(await readFile(path, "utf8")));
      if (errors.length) failures.push(`${path}: ${errors.join("; ")}`);
    } catch (error) { failures.push(`${path}: ${error.message}`); }
  }
  if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
  console.log(`Journey Contract Gate: ${paths.length} contract(s) structurally valid. This does not verify semantic correctness.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
