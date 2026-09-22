import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Annotation Inspector edits the selected endpoint offset through one semantic command", async ({ page }) => {
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
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await inspector.getByLabel("Inspector annotation endpoint").selectOption("from");
  await inspector.getByLabel("Inspector annotation anchor signal").selectOption("sig_cycle_ready");
  await inspector.getByLabel("Inspector annotation anchor cycle").fill("8");
  await inspector.getByLabel("Inspector annotation anchor point").selectOption("rising-edge");
  await inspector.getByLabel("Inspector annotation anchor X").fill("7");
  await inspector.getByLabel("Inspector annotation anchor Y").fill("-3");
  await inspector.getByTestId("apply-inspector-annotation-anchor").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await expect(inspector.getByLabel("Inspector annotation anchor X")).toHaveValue("7");
  await expect(inspector.getByLabel("Inspector annotation anchor Y")).toHaveValue("-3");
  await expect(inspector.getByLabel("Inspector annotation anchor signal")).toHaveValue("sig_cycle_ready");
  await expect(inspector.getByLabel("Inspector annotation anchor cycle")).toHaveValue("8");
  await expect(inspector.getByLabel("Inspector annotation anchor point")).toHaveValue("rising-edge");
});
