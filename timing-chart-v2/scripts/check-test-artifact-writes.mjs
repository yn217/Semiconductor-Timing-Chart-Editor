import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// #782: specs must not write into the tracked artifacts/ tree directly; use tests/e2e/artifact-output.ts (visualArtifactRoot).
const dir = resolve(process.cwd(), "tests/e2e");
const offenders = [];
for (const file of await readdir(dir)) {
  if (!file.endsWith(".ts") || file === "artifact-output.ts") continue;
  const source = await readFile(resolve(dir, file), "utf8");
  if (/(?:path:\s*[`"'][^`"']*artifacts[/\]|resolve\([^)]*["'`]artifacts["'`/])/.test(source)) offenders.push(file);
}
if (offenders.length) { console.error(`Specs write tracked artifacts directly (use visualArtifactRoot):\n${offenders.join("\n")}`); process.exit(1); }
console.log("Test artifact write guard passed (no spec writes the tracked artifacts/ tree directly).");
