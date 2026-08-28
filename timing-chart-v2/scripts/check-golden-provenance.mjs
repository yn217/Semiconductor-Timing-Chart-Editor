import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { computeSourceFingerprint, isSourcePath } from "./lib/source-fingerprint.mjs";

const root = resolve(process.cwd());
const outputRoot = resolve(root, "../artifacts/gui-visual-acceptance");
const metricsPath = resolve(outputRoot, "layout-metrics.json");
const regionPath = resolve(outputRoot, "region-diff.json");
const repositoryRoot = resolve(root, "..");
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();

let metrics;
let region;
try {
  metrics = JSON.parse(await readFile(metricsPath, "utf8"));
  region = JSON.parse(await readFile(regionPath, "utf8"));
} catch (error) {
  console.error("HARNESS FAIL: stale visual evidence");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const layoutProvenance = metrics.provenance;
const regionProvenance = region.provenance;
const currentFingerprint = await computeSourceFingerprint(repositoryRoot);
const testedCommit = layoutProvenance?.testedCommit;
let testedCommitIsAncestor = false;
let interveningSourceChanges = [];
if (testedCommit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", testedCommit, currentHead], { cwd: repositoryRoot, stdio: "ignore" });
    testedCommitIsAncestor = true;
  } catch {
    testedCommitIsAncestor = false;
  }
  const changed = execFileSync("git", ["diff", "--name-only", `${testedCommit}..${currentHead}`], { cwd: repositoryRoot, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  interveningSourceChanges = changed.filter((path) => isSourcePath(path));
}
const checks = {
  testedCommit,
  currentHead,
  evidenceFingerprint: layoutProvenance?.sourceFingerprint,
  currentFingerprint,
  layoutRegionTestedCommitMatches: testedCommit === regionProvenance?.testedCommit,
  layoutRegionFingerprintMatches: layoutProvenance?.sourceFingerprint === regionProvenance?.sourceFingerprint,
  testedCommitIsAncestor,
  interveningSourceChanges,
  fingerprintMatches: layoutProvenance?.sourceFingerprint === currentFingerprint,
  goldenMatches: Boolean(layoutProvenance?.goldenSha256) && layoutProvenance.goldenSha256 === regionProvenance?.goldenSha256,
};
checks.evidenceFresh = checks.layoutRegionTestedCommitMatches && checks.layoutRegionFingerprintMatches && checks.testedCommitIsAncestor && checks.fingerprintMatches && checks.goldenMatches;
console.log(JSON.stringify(checks, null, 2));
if (!checks.evidenceFresh) {
  console.error("HARNESS FAIL: stale visual evidence");
  process.exit(1);
}
