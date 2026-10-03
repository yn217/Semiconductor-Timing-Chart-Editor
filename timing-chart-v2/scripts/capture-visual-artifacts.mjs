import { spawn } from "node:child_process";

// Explicit capture: the only supported way to (re)write tracked artifacts/ images and reports (#782).
const child = spawn(process.execPath, ["./scripts/run-playwright.mjs", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, UPDATE_VISUAL_ARTIFACTS: "1" }, windowsHide: true });
child.on("exit", (code) => process.exit(code ?? 1));
