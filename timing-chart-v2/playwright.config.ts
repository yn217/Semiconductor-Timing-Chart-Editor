import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${process.env.PW_TEST_PORT ?? "4198"}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm --workspace @timing-chart-v2/editor run dev -- --host 127.0.0.1 --port ${process.env.PW_TEST_PORT ?? "4198"} --strictPort`,
    url: `http://127.0.0.1:${process.env.PW_TEST_PORT ?? "4198"}`,
    reuseExistingServer: false,
  },
});
