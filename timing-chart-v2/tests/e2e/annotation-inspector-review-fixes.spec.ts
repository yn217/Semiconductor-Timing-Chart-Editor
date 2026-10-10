import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Annotation Inspector Apply Anchor can clear an endpoint Signal to (none)", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("arrow");
  await page.getByRole("button", { name: "Add annotation" }).click();
  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='arrow']");
  await owner.locator("[data-role='annotation-label']").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Inspector Annotation Anchor", { exact: true })).toBeVisible();
  await inspector.getByLabel("Inspector annotation endpoint").selectOption("from");
  await expect(inspector.getByLabel("Inspector annotation anchor signal")).not.toHaveValue("(none)");
  await inspector.getByLabel("Inspector annotation anchor signal").click();
  await inspector.getByRole("option", { name: "(none)", exact: true }).click();
  await expect(inspector.getByLabel("Inspector annotation anchor signal")).toHaveValue("(none)");
  await inspector.getByTestId("apply-inspector-annotation-anchor").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  // Re-read the endpoint from the canonical Annotation: switching the endpoint away and back reloads the draft from the document.
  await inspector.getByLabel("Inspector annotation endpoint").selectOption("to");
  await inspector.getByLabel("Inspector annotation endpoint").selectOption("from");
  await expect(inspector.getByLabel("Inspector annotation anchor signal")).toHaveValue("(none)");
});
