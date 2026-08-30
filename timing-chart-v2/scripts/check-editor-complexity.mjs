import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const file = "apps/editor/src/minimal-cycle-view.tsx";
const ownershipMap = "apps/editor/src/OWNERSHIP.md";
const source = await readFile(resolve(root, file), "utf8");
const ownership = await readFile(resolve(root, ownershipMap), "utf8");
const lines = source.split(/\r?\n/).length;
const budget = 5000;
const forbiddenOwners = [
  ["Canonical mutation outside command/session path", /setSnapshot\([^)]*document|validateCanonicalDocument\([^)]*setSnapshot/],
];
const requiredOwners = ["Review scope, severity, navigation", "Viewport, timeline, ruler and grid lifecycle", "File open/save/export lifecycle"];
const violations = [
  ...forbiddenOwners.filter(([, pattern]) => pattern.test(source)).map(([name]) => name),
  ...requiredOwners.filter((owner) => !ownership.includes(owner)).map((owner) => `ownership map missing: ${owner}`),
];
if (lines > budget || violations.length > 0) {
  console.error(JSON.stringify({ file, lines, budget, violations }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ file, lines, budget, violations: [] }, null, 2));
