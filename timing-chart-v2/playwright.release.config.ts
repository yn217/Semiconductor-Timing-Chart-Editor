import { defineConfig, devices } from "@playwright/test";

const port = process.env.PW_TEST_PORT;
if (!port) throw new Error("Use npm run release:smoke for an isolated owned server.");
const built = process.env.RELEASE_BUILT_ARTIFACT === "1";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: [
    "release-legacy-migration.spec.ts",
    "file-operation-feedback.spec.ts",
    "issue-1080-transition-row-selection.spec.ts",
    "issue-777-current-samples-open-save-roundtrip.spec.ts",
    "transaction-bottom-phase-linked-signals.spec.ts",
    "combined-column-resize-alignment.spec.ts",
    "undo-redo-selection-context.spec.ts",
    "transaction-export.spec.ts",
  ],
  grep: /release legacy migration|failed Open (syntax|invalid)\.tcd is visible without a selected Signal at (1280x720|1672x941)|Combined keeps|Cycle Transition row selection|survives Open -> Save|Selecting a Transaction keeps|Rename Undo keeps|creates, edits, links, saves|exports deterministic SVG plus PNG/,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "off", baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: built
      ? `npm --workspace @timing-chart-v2/editor exec -- vite preview --host 127.0.0.1 --port ${port} --strictPort`
      : `npm --workspace @timing-chart-v2/editor run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
