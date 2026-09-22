import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const cli = resolve(root, "node_modules/@playwright/test/cli.js");
const outputPath = resolve(root, process.argv[2] ?? "qa/test-suite-inventory.json");
const markdownPath = resolve(root, "docs/TEST_SUITE_INVENTORY.md");

const result = spawnSync(process.execPath, [cli, "test", "--list", "--reporter=json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const report = JSON.parse(result.stdout);
const cases = [];

function visit(suites, file = "") {
  for (const suite of suites ?? []) {
    const suiteFile = suite.file || file;
    for (const spec of suite.specs ?? []) {
      const normalizedFile = (spec.file || suiteFile).replaceAll("\\", "/");
      for (const test of spec.tests ?? []) {
        cases.push({
          file: normalizedFile,
          line: spec.line,
          title: spec.title,
          project: test.projectName,
          timeoutMs: test.timeout,
          tags: spec.tags ?? [],
          annotations: test.annotations ?? [],
          domain: null,
          originIssue: null,
          type: null,
          costClass: null,
          measuredRuntimeMs: null,
          primaryContract: null,
          duplicateGroup: null,
          executionTier: null,
          decision: "UNREVIEWED",
          reason: "Inventory record generated from Playwright collection; classify from the test's protected product invariant before changing coverage.",
          replacementTest: null,
          reviewStatus: "UNREVIEWED",
        });
      }
    }
    visit(suite.suites, suiteFile);
  }
}

visit(report.suites);
cases.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.title.localeCompare(b.title));

const inventory = {
  generatedAt: new Date().toISOString(),
  source: "Playwright test --list --reporter=json; no tests were executed",
  playwrightVersion: report.config?.version ?? null,
  specFileCount: new Set(cases.map((test) => test.file)).size,
  caseCount: cases.length,
  reviewPolicy: "UNREVIEWED entries are not acceptance-complete classifications. Fill every field and set reviewStatus to REVIEWED only after reading the test and mapping its invariant.",
  tests: cases,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
const fileCounts = new Map();
for (const test of cases) fileCounts.set(test.file, (fileCounts.get(test.file) ?? 0) + 1);
const markdown = [
  "# Playwright test inventory",
  "",
  `Generated from Playwright collection (${inventory.playwrightVersion}); ${inventory.specFileCount} spec files and ${inventory.caseCount} test cases. Collection does not execute tests.`,
  "",
  "> This is a complete name/location inventory, not a completed semantic review. Every row remains `UNREVIEWED` until its product invariant, layer, cost, tier, decision, and replacement mapping (if any) have been reviewed in the JSON manifest.",
  "",
  "| Spec file | Cases | Review status |",
  "| --- | ---: | --- |",
  ...[...fileCounts].sort(([a], [b]) => a.localeCompare(b)).map(([file, count]) => `| \`${file}\` | ${count} | UNREVIEWED |`),
  "",
  "Per-case titles, source lines, project, timeout, tags, annotations, and classification fields are in [`qa/test-suite-inventory.json`](../qa/test-suite-inventory.json).",
  "",
  "Regenerate with `npm run test:inventory` after installing workspace dependencies.",
  "",
].join("\n");
mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(markdownPath, markdown);
console.log(`Wrote ${cases.length} test cases from ${inventory.specFileCount} spec files to ${outputPath}`);
