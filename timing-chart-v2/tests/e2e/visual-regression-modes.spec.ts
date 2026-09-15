import { expect, test } from "@playwright/test";

// Layout-shape regression net: this session's manual QA passes kept finding
// real layout bugs (Combined mode's MiniMap detaching at short viewports,
// Cycle mode's grid drifting from the waveform) that every targeted e2e
// assertion in the suite missed, because each assertion checks one property
// (an attribute, a bounding-box relationship) rather than "does the whole
// screen still look right." A whole-viewport screenshot diff catches the
// class of bug none of those targeted checks are shaped to see -- it is
// deliberately coarse and unrelated to `gui-visual-acceptance.spec.ts`
// (a V1-vs-V2 pixel-fidelity proof for one fixed Cycle golden), which this
// does not replace.
//
// First run on a given platform/browser has no baseline and fails with a
// "missing snapshot" diagnostic that writes the actual capture next to
// where the baseline belongs -- promote that file (or run this suite with
// `--update-snapshots`) once to establish it, then commit it. Snapshot
// filenames are automatically namespaced per OS by Playwright, so Windows
// and Linux (CI) baselines never collide or get compared against each
// other.
const viewports = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1672x941", width: 1672, height: 941 },
] as const;

const modes = ["Cycle", "Transaction", "Combined"] as const;

for (const viewport of viewports) {
  test.describe(`view mode layout shape at ${viewport.name}`, () => {
    for (const mode of modes) {
      test(`${mode} mode renders without layout regression`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto("/?transaction-demo");
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
        await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
        // Cycle/Combined paint their waveform surface asynchronously; wait for
        // the shared readiness gate rather than a fixed timeout.
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
        await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
        await expect(page).toHaveScreenshot(`${mode.toLowerCase()}-${viewport.name}.png`, {
          maxDiffPixelRatio: 0.015,
          animations: "disabled",
        });
      });
    }
  });
}
