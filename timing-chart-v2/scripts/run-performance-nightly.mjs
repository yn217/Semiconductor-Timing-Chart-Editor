import { spawn } from "node:child_process";

console.log("[performance-profile] PERF_SCALE=nightly");

const child = spawn(process.execPath, [
  "scripts/run-playwright.mjs",
  "tests/e2e/performance-closure.spec.ts",
  ...process.argv.slice(2),
], {
  stdio: "inherit",
  env: { ...process.env, PERF_SCALE: "nightly" },
  windowsHide: true,
});

const forwardSignal = (signal) => child.kill(signal);
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
