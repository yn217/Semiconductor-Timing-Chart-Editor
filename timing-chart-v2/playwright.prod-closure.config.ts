import { defineConfig, devices } from "@playwright/test";

// Production-build Open closure pass: build first (`npm --workspace @timing-chart-v2/editor run build`), then this serves apps/editor/dist.
const port = process.env.PW_TEST_PORT ?? "4199";
export default defineConfig({
  testDir: "./tests/performance",
  testMatch: /open-closure-production\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Desktop Chrome"], trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm --workspace @timing-chart-v2/editor exec -- vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
