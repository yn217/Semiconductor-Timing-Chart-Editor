import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [profile, ...playwrightArgs] = process.argv.slice(2);
if (!profile) {
  console.error("Usage: node scripts/run-test-profile.mjs <profile> [Playwright arguments]");
  process.exit(2);
}

const root = process.cwd();
const inventoryPath = resolve(root, "qa/test-suite-inventory.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const reviewed = inventory.tests.filter((test) => test.reviewStatus === "REVIEWED" && test.profiles?.includes(profile));
if (reviewed.length === 0) {
  console.error(`Profile '${profile}' has no reviewed tests in ${inventoryPath}. Classify cases and regenerate with npm run test:inventory.`);
  process.exit(2);
}

// Playwright's list parser prefers the single-character `›` delimiter when
// present. Use it so titles containing ordinary `>` (for example, arrows in
// journey names) remain intact.
const lines = [...new Set(reviewed.map((test) => [test.file, ...(test.suitePath ?? []), test.title].join(" › ")))].sort();
const tempDir = mkdtempSync(join(tmpdir(), "timing-chart-test-profile-"));
const listPath = join(tempDir, `${profile}.list`);
writeFileSync(listPath, `${lines.join("\n")}\n`);

console.log(`[test-profile] name=${profile} selected=${reviewed.length} unique-list-entries=${lines.length}`);
const result = spawnSync(process.execPath, [resolve(root, "scripts/run-playwright.mjs"), "--test-list", listPath, ...playwrightArgs], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
rmSync(listPath, { force: true });
rmdirSync(tempDir);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
