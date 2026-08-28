import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const appRoot = resolve(process.cwd());
const source = await readFile(resolve(appRoot, "apps/editor/src/minimal-cycle-view.tsx"), "utf8");
const styles = await readFile(resolve(appRoot, "apps/editor/src/styles.css"), "utf8");

const forbidden = [
  ["alternate Golden Ribbon component", /V8GoldenHomeRibbon/],
  ["visual-reference CSS selector", /\[data-visual-reference|data-visual-reference\s*=\s*"true"/],
  ["visual-reference display branch", /visualReference\s*\?\s*<[^>]+>/],
];
const violations = forbidden.filter(([, pattern]) => pattern.test(source) || pattern.test(styles)).map(([name]) => name);
const report = {
  source: "production-presentation-static-contract",
  sameProductionComponentPath: violations.length === 0,
  forbiddenPresentationBranches: violations,
  allowedQueryUse: /visualReference/.test(source),
};
console.log(JSON.stringify(report, null, 2));
if (violations.length > 0) {
  console.error(`Production presentation contract failed: ${violations.join(", ")}`);
  process.exitCode = 1;
}
