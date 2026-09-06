import { expect, test } from "@playwright/test";

// #205: overlapping Measurements without an explicit lane must auto-stack
// onto genuinely different lanes rather than collapsing back onto lane 0
// once every existing lane is already occupied.

test("two overlapping Measurements with no explicit lane auto-stack onto different lanes", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  // Same selected range for both -> identical (fully overlapping) x-span,
  // the worst case for auto lane assignment.
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owners = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(owners).toHaveCount(2);
  const lanes = await owners.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.measurementLane));
  expect(new Set(lanes).size, JSON.stringify(lanes)).toBe(2);
  expect(lanes.map(Number).sort()).toEqual([0, 1]);
});

test("a third Measurement overlapping both stacks onto lane 2, not back onto lane 0 or 1", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owners = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(owners).toHaveCount(3);
  const lanes = await owners.evaluateAll((items) => items.map((item) => Number((item as HTMLElement).dataset.measurementLane)));
  expect(new Set(lanes).size, JSON.stringify(lanes)).toBe(3);
  expect(lanes.sort()).toEqual([0, 1, 2]);
});
