import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(root, "apps", "editor", "src", "styles", "legacy.css");
// #260's region-ownership migration is now complete (PR #356): every
// production selector that used to live in legacy.css has a single,
// explicit region owner (app-shell.css/ribbon.css/bottom-editor.css/
// controls.css/etc.), and legacy.css itself holds nothing but its own
// explanatory header comment. The budget is therefore locked to that
// completed state -- zero selectors -- rather than the earlier
// generous in-migration allowance, so adding even one new selector
// back to legacy.css (reversing the migration) fails this gate
// immediately instead of silently fitting inside stale headroom.
const reviewedBudgetBytes = 700;
const reviewedSelectorBudget = 0;
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
