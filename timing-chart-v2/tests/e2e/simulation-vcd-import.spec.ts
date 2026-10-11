import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("imports a session-only VCD, compares by exact mapping and reveals zero-tolerance timing findings", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  const sourceDocument = canonicalFixture();
  const document = {
    ...sourceDocument,
    timeline: { ...sourceDocument.timeline, physicalTimebase: { referenceFrequencyHz: 1_000_000_000, unit: "ns" as const } },
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "simulation-compare-fixture.tcd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_data']")).toBeAttached();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", /^\d+$/);

  const surface = page.getByTestId("cycle-surface");
  const baseline = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
  };
  await page.getByRole("tab", { name: "Simulation", exact: true }).click();

  const vcd = (secondChangeCycle: number) => `$timescale 1ns $end $var wire 8 ! DATA $end $enddefinitions $end #0 b00000000 ! #${secondChangeCycle} b10100101 !`;
  await page.getByLabel("Import VCD text file").setInputFiles({
    name: "reference.vcd", mimeType: "text/plain", buffer: Buffer.from(vcd(4)),
  });
  await expect(page.getByTestId("simulation-status")).toContainText("Loaded 1 variables and 2 value changes");
  await expect(page.getByLabel("Map DATA to specification signal")).toHaveValue("sig_data");
  await page.getByTestId("simulation-compare").click();
  await expect(page.getByTestId("simulation-status")).toHaveText("Compared 1 mapped signals: no differences.");
  await expect(surface).toHaveAttribute("data-canonical-revision", baseline.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);

  await page.getByLabel("Import VCD text file").setInputFiles({
    name: "shifted.vcd", mimeType: "text/plain", buffer: Buffer.from(vcd(5)),
  });
  await expect(page.getByTestId("simulation-status")).toContainText("Loaded 1 variables and 2 value changes");
  await page.getByTestId("simulation-compare").click();
  await expect(page.getByTestId("simulation-results")).toContainText("timing-mismatch");
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("DATA");
  await expect(surface).toHaveAttribute("data-canonical-revision", baseline.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);
});
