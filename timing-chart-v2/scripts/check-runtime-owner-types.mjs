import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeRoot = fileURLToPath(new URL("../apps/editor/src/runtime/", import.meta.url));
const forbidden = /:\s*any\b|\bas\s+any\b|(?:Array|Promise|ReadonlyArray)<any>/;
const files = [];

function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collect(path);
    else if (/\.(?:ts|tsx)$/.test(entry)) files.push(path);
  }
}

collect(runtimeRoot);
const violations = files.flatMap((path) => {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return lines.flatMap((line, index) => forbidden.test(line)
    ? [{ file: relative(process.cwd(), path).replaceAll("\\", "/"), line: index + 1, text: line.trim() }]
    : []);
});

if (violations.length > 0) {
  console.error("Runtime owner type gate failed: unapproved any boundary detected.");
  for (const violation of violations) console.error(`${violation.file}:${violation.line}: ${violation.text}`);
  process.exit(1);
}

console.log(`Runtime owner type gate passed (${files.length} runtime files; no unapproved any boundary).`);
