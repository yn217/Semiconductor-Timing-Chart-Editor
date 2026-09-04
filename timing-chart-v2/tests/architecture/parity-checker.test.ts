import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

const workspace = path.resolve(import.meta.dirname, "../..");
const checker = path.join(workspace, "scripts", "check-v1-v2-parity.mjs");
const matrixSource = path.join(workspace, "docs", "v1-v2-parity.json");
const manifestSource = path.join(workspace, "docs", "v1-v2-source-manifest.json");

it("fails when matrix coverage is missing a source-manifest Issue", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "v1-v2-parity-"));
  const matrix = path.join(directory, "matrix.json");
  const manifest = path.join(directory, "manifest.json");
  cpSync(manifestSource, manifest);
  const parsed = JSON.parse(readFileSync(matrixSource, "utf8")) as { legacyIssueCoverage: number[] };
  parsed.legacyIssueCoverage = parsed.legacyIssueCoverage.slice(0, -1);
  writeFileSync(matrix, JSON.stringify(parsed));

  let output = "";
  try {
    execFileSync(process.execPath, [checker, "--matrix", matrix, "--manifest", manifest], { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  }
  expect(output).toContain("source-universe mismatch");
});

it("rejects Cycle/Transaction evidence from satisfying Signal Split", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "v1-v2-split-identity-"));
  const matrix = path.join(directory, "matrix.json");
  const manifest = path.join(directory, "manifest.json");
  const status = path.join(directory, "status.json");
  cpSync(manifestSource, manifest);
  cpSync(path.join(workspace, "docs", "v1-v2-contract-status.json"), status);
  const parsed = JSON.parse(readFileSync(matrixSource, "utf8")) as { independentContracts: Array<{ id: string; implementationEvidence: string }> };
  const signalSplit = parsed.independentContracts.find((contract) => contract.id === "GUI-SIGNAL-SPLIT");
  if (!signalSplit) throw new Error("Signal Split fixture row is missing");
  signalSplit.implementationEvidence = "V2 Cycle/Transaction Split mode is shared and therefore satisfies Signal Split.";
  writeFileSync(matrix, JSON.stringify(parsed));

  let output = "";
  try {
    execFileSync(process.execPath, [checker, "--matrix", matrix, "--manifest", manifest, "--status", status], { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  }
  expect(output).toContain("GUI-SIGNAL-SPLIT evidence must not use Cycle/Transaction Split as implementation evidence");
});
