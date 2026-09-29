import { spawn } from "node:child_process";

console.log("[performance-profile] PERF_SCALE=nightly");

const forwardedSignals = ["SIGINT", "SIGTERM"];
let activeChild;
for (const signal of forwardedSignals) process.once(signal, () => activeChild?.kill(signal));

const run = (args) => new Promise((resolve, reject) => {
  activeChild = spawn(process.execPath, ["scripts/run-playwright.mjs", ...args], {
    stdio: "inherit",
    env: { ...process.env, PERF_SCALE: "nightly" },
    windowsHide: true,
  });
  activeChild.once("error", reject);
  activeChild.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
});

const ordinaryPerformanceExit = await run([
  "tests/e2e/performance-closure.spec.ts",
  ...process.argv.slice(2),
]);
if (ordinaryPerformanceExit !== 0) {
  process.exitCode = ordinaryPerformanceExit;
} else {
  // Keep the expensive full-span stress gate out of ordinary PR E2E while
  // still running it as part of the explicit nightly performance profile.
  process.exitCode = await run([
    "--config=playwright.performance.config.ts",
    "tests/performance/fixed-full-span-open.spec.ts",
    "--workers=1",
    "--trace=off",
  ]);
}
