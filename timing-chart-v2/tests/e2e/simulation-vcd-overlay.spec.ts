import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("a mapped VCD signal can be overlaid by canonical Signal ID without changing document state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = canonicalFixture();
  const document = { ...source, timeline: { ...source.timeline, physicalTimebase: { referenceFrequencyHz: 1_000_000_000, unit: "ns" as const } } };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "simulation-overlay-fixture.tcd.json",
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
  await page.getByLabel("Import VCD text file").setInputFiles({
    name: "trace.vcd",
    mimeType: "text/plain",
    buffer: Buffer.from("$timescale 1ns $end\n$scope module top $end\n$var wire 8 ! DATA $end\n$upscope $end\n$enddefinitions $end\n#0 b00000000 !\n#2 b00000001 !\n#4 bxxxxxxxx !\n#6 b00000000 !"),
  });
  await expect(page.getByTestId("simulation-status")).toContainText("Loaded 1 variables and 4 value changes");
  const overlayToggle = page.getByTestId("simulation-trace-overlay-toggle").and(page.locator("[data-simulation-trace-signal-id='sig_data']"));
  await overlayToggle.click();
  const overlay = page.locator("[data-role='simulation-trace-overlay'][data-simulation-trace-signal-id='sig_data']");
  await expect(overlay).toBeAttached();
  await expect(overlay).toHaveAttribute("d", /M/);
  await expect.poll(() => overlay.evaluate((element) => (element as SVGPathElement).getBBox().width)).toBeGreaterThan(0);
  await expect(page.getByTestId("simulation-status")).toContainText("session-only VCD trace");
  await expect(surface).toHaveAttribute("data-canonical-revision", baseline.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator(".cycle-panel[data-view-mode='Transaction']")).toBeVisible();
  await expect(overlay).toHaveCount(0);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator(".cycle-panel[data-view-mode='Cycle']")).toBeVisible();
  await expect(overlay).toBeAttached();
  await page.getByRole("tab", { name: "Simulation", exact: true }).click();

  await overlayToggle.click();
  await expect(overlay).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-canonical-revision", baseline.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);
});
