import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/performance",
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: `test-results/performance-results-${process.env.PW_TEST_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "manual"}.json` }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${process.env.PW_TEST_PORT ?? "4198"}`,
    ...devices["Desktop Chrome"],
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm --workspace @timing-chart-v2/editor run dev -- --host 127.0.0.1 --port ${process.env.PW_TEST_PORT ?? "4198"} --strictPort`,
    url: `http://127.0.0.1:${process.env.PW_TEST_PORT ?? "4198"}`,
    reuseExistingServer: false,
  },
});
