import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const generatedPrefixes = ["timing-chart-v1/artifacts/", "timing-chart-v2/artifacts/", "test-results/", "playwright-report/", "timing-chart-v2/test-results/", "timing-chart-v2/playwright-report/"];

export function isSourcePath(path) {
  return !generatedPrefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

export async function computeSourceFingerprint(repositoryRoot) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot });
  const paths = output.toString("utf8").split("\0").filter(Boolean).filter(isSourcePath).sort();
  const entries = [];
  for (const path of paths) {
    let content;
    try {
      content = await readFile(resolve(repositoryRoot, path));
    } catch (error) {
      if (error?.code === "ENOENT") continue; // An unstaged tracked deletion is part of the working tree, not a fingerprinting failure.
      throw error;
    }
    const contentHash = createHash("sha256").update(content).digest("hex");
    entries.push(`${path}\0${contentHash}\n`);
  }
  return createHash("sha256").update(entries.join(""), "utf8").digest("hex");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  console.log(JSON.stringify({ sourceFingerprint: await computeSourceFingerprint(repositoryRoot) }));
}
