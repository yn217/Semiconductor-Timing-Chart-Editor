import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("VCD resource bounds reject amplification and render one shared manual mapping candidate list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = canonicalFixture();
  const document = { ...source, timeline: { ...source.timeline, physicalTimebase: { referenceFrequencyHz: 1_000_000_000, unit: "ns" as const } } };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fixture.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await page.getByRole("tab", { name: "Simulation", exact: true }).click();
  await page.getByLabel("Import VCD text file").setInputFiles({ name: "wide.vcd", mimeType: "text/plain", buffer: Buffer.from("$timescale 1ns $end $var wire 1000001 ! q $end $enddefinitions $end") });
  await expect(page.getByTestId("simulation-status")).toContainText("resource-limit");
  await page.getByLabel("Import VCD text file").setInputFiles({ name: "valid.vcd", mimeType: "text/plain", buffer: Buffer.from('$timescale 1ns $end $var wire 8 ! DATA $end $var wire 1 " EXTRA $end $enddefinitions $end #0 b0 !') });
  await expect(page.getByTestId("simulation-status")).toContainText("Loaded 2 variables and 1 value changes");
  const options = page.locator("#simulation-signal-options option");
  await expect(options).toHaveCount(document.signals.filter((signal) => signal.type !== "commentRow").length);
  await expect(page.getByLabel("Map DATA to specification signal")).toHaveValue("sig_data");
  await page.getByLabel("Map EXTRA to specification signal").fill("sig_data");
  await expect(page.getByTestId("simulation-duplicate-mapping")).toBeVisible();
  await expect(page.getByTestId("simulation-compare")).toBeDisabled();
  await expect(page.getByTestId("simulation-compare")).toBeEnabled();
});
