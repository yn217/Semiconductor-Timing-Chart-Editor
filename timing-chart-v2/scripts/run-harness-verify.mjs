import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const script of ["harness:capture", "harness:diff", "harness:check"]) {
  const result = spawnSync(npm, ["run", script], { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
