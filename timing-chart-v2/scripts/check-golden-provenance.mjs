import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const outputRoot = resolve(root, "../artifacts/gui-visual-acceptance");
const metricsPath = resolve(outputRoot, "layout-metrics.json");
const regionPath = resolve(outputRoot, "region-diff.json");
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve(root, ".."), encoding: "utf8" }).trim();

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

const checks = {
  currentHead,
  layoutGitHead: metrics.gitHead,
  regionGitHead: region.gitHead,
  layoutMatches: metrics.gitHead === currentHead,
  regionMatches: region.gitHead === currentHead,
  crossReportMatches: metrics.gitHead === region.gitHead,
};
console.log(JSON.stringify(checks, null, 2));
if (!checks.layoutMatches || !checks.regionMatches || !checks.crossReportMatches) {
  console.error("HARNESS FAIL: stale visual evidence");
  process.exit(1);
}
