import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "apps", "editor", "src", "styles", "legacy.css");
// #260's first regional migration leaves a bounded compatibility layer. Keep
// both size and selector count explicit so new legacy rules require a reviewed
// exception instead of silently reversing the migration.
const reviewedBudgetBytes = 40000;
const reviewedSelectorBudget = 205;
const actualBytes = (await stat(file)).size;
const source = await readFile(file, "utf8");
let selectorCount = 0;
let depth = 0;
let quote = "";
let comment = false;
for (let index = 0; index < source.length; index += 1) {
  const character = source[index];
  const next = source[index + 1];
  if (comment) {
    if (character === "*" && next === "/") {
      comment = false;
      index += 1;
    }
    continue;
  }
  if (!quote && character === "/" && next === "*") {
    comment = true;
    index += 1;
    continue;
  }
  if (quote) {
    if (character === "\\") index += 1;
    else if (character === quote) quote = "";
    continue;
  }
  if (character === "\"" || character === "'") {
    quote = character;
    continue;
  }
  if (character === "{") {
    if (depth === 0) selectorCount += 1;
    depth += 1;
  } else if (character === "}") {
    depth -= 1;
  }
}

if (depth !== 0 || actualBytes > reviewedBudgetBytes || selectorCount > reviewedSelectorBudget) {
  console.error("legacy.css exceeds the reviewed retirement budget: " + actualBytes + "/" + reviewedBudgetBytes + " bytes, " + selectorCount + "/" + reviewedSelectorBudget + " selectors");
  process.exitCode = 1;
} else {
  console.log("Legacy CSS retirement budget passed (" + actualBytes + "/" + reviewedBudgetBytes + " bytes, " + selectorCount + "/" + reviewedSelectorBudget + " selectors).");
}
