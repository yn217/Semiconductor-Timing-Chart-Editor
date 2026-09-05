import { spawnSync } from "node:child_process";

// shell:true is required on Windows to resolve npm.cmd through PATH
// correctly; without it spawnSync can fail silently (no stdio, no thrown
// error) rather than actually running the script.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const script of ["harness:capture", "harness:diff", "harness:check"]) {
  const result = spawnSync(npm, ["run", script], { stdio: "inherit", shell: true });
  if (result.error) { console.error(`Failed to run "${script}": ${result.error.message}`); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Harness verify PASS: capture, diff, and check all green.");
