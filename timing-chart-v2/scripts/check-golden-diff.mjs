import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const reportPath = resolve(process.cwd(), "artifacts/gui-visual-acceptance/layout-metrics.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const valid = report.acceptance === "PASS" && report.geometryPass === true && report.visualDiff?.pass === true;
console.log(JSON.stringify({ acceptance: report.acceptance, geometryPass: report.geometryPass, visualDiff: report.visualDiff, valid }, null, 2));
if (!valid) process.exitCode = 1;
