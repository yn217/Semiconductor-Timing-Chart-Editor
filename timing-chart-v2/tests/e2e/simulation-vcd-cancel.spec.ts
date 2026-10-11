import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("large VCD comparison yields, can be cancelled, and keeps mapping edits out while running", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = canonicalFixture();
  const document = { ...source, timeline: { ...source.timeline, physicalTimebase: { referenceFrequencyHz: 1_000_000_000, unit: "ns" as const } } };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "simulation-cancel-fixture.tcd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  const surface = page.getByTestId("cycle-surface");
  const baseline = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
  };
  await page.getByRole("tab", { name: "Simulation", exact: true }).click();

  const changes = Array.from({ length: 20_000 }, (_, index) => `#${index} ${index % 2 ? "1" : "0"}!`).join("\n");
  const vcd = `$timescale 1ns $end\n$scope module top $end\n$var wire 1 ! VALID $end\n$upscope $end\n$enddefinitions $end\n${changes}`;
  await page.getByLabel("Import VCD text file").setInputFiles({
    name: "large-reference.vcd",
    mimeType: "text/plain",
    buffer: Buffer.from(vcd),
  });
  await expect(page.getByTestId("simulation-status")).toContainText("Loaded 1 variables and 20000 value changes");
  await page.getByTestId("simulation-compare").click();
  await expect(page.getByTestId("simulation-cancel-comparison")).toBeVisible();
  await expect(page.getByLabel("Map top.VALID to specification signal")).toBeDisabled();
  await page.getByTestId("simulation-cancel-comparison").click();
  await expect(page.getByTestId("simulation-status")).toHaveText("Comparison cancelled.");
  await expect(page.getByTestId("simulation-results")).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-canonical-revision", baseline.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);
});
