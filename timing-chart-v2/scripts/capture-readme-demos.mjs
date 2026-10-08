import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Always capture the current source, never silently reuse a previous checkout's dist.
const build = spawnSync(process.execPath, ["../../node_modules/vite/bin/vite.js", "build"], {
  cwd: "apps/editor", stdio: "inherit", windowsHide: true,
});
if (build.error) throw build.error;
if (build.status !== 0 || !existsSync("apps/editor/dist/index.html")) throw new Error("Production build failed; no demo capture was started.");
const child = spawn(process.execPath, ["scripts/run-playwright.mjs", "--config=playwright.demo.config.ts", ...process.argv.slice(2)], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, DEMO_SOURCE_HEAD: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim() },
});
child.once("error", (error) => { console.error(error); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
