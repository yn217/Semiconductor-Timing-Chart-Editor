import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("apps/editor/dist/index.html")) throw new Error("Build the production app before capturing demos.");
const child = spawn(process.execPath, ["scripts/run-playwright.mjs", "--config=playwright.demo.config.ts", ...process.argv.slice(2)], {
  stdio: "inherit", windowsHide: true,
});
child.once("error", (error) => { console.error(error); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
