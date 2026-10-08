import { defineConfig } from "@playwright/test";

const port = process.env.PW_TEST_PORT;
if (!port) throw new Error("Run scripts/capture-readme-demos.mjs to start an owned preview server.");
export default defineConfig({
  testDir: "tests/demo",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  // Playwright clears its outputDir before each run. Keep saved demo masters elsewhere so a focused recapture preserves other demos.
  outputDir: "test-results/readme-demo",
  reporter: "list",
  use: {
    browserName: "chromium", headless: true,
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off", video: { mode: "on", size: { width: 1440, height: 900 } },
  },
  webServer: {
    command: `npm --workspace @timing-chart-v2/editor exec -- vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false,
  },
});
