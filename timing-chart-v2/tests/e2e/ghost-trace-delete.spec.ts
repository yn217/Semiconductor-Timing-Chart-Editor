import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("rejects production Signal delete when the only dependency is Ghost Trace sourceSignalId", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("ghostTrace");
  // The sample already carries a ghostTrace that the taller Cycle window now mounts too; the new one is the added owner.
  const ghosts = host.locator("[data-role='annotation-owner'][data-annotation-type='ghostTrace']");
  const ghostsBefore = await ghosts.count();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(ghosts).toHaveCount(ghostsBefore + 1);
  await expect(host.locator("[data-role='annotation-owner'][data-annotation-type='ghostTrace'][data-source-signal-id='sig_cycle_request']")).not.toHaveCount(0);
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();
  const countersBefore = await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByTestId("signal-delete").click();

  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
  await expect(page.getByTestId("editor-problem")).toContainText("annotation dependents");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
  await expect(host.locator("[data-role='timing-chart-surface']")).toHaveAttribute("data-render-counters", countersBefore!);
});
