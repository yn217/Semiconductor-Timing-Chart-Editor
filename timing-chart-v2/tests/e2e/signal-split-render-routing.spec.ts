import { expect, test } from "@playwright/test";

test("Signal Split shows the same canonical Signal sequence in both panes", async ({ page }) => {
  await page.goto("/");
  const upper = page.getByTestId("cycle-surface");
  await expect(upper).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  const lower = page.getByTestId("cycle-surface-lower");
  await expect(lower).toBeVisible();
  const ids = async (surface: typeof upper) => surface.locator("[data-role='timing-row']").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")).filter((id): id is string => id !== null));
  await expect.poll(async () => {
    const upperIds = await ids(upper);
    const lowerIds = await ids(lower);
    const commonLength = Math.min(upperIds.length, lowerIds.length);
    return { upper: upperIds.slice(0, commonLength), lower: lowerIds.slice(0, commonLength) };
  }).toEqual({ upper: ["sig_cycle_clock", "sig_cycle_reset_n", "sig_cycle_request", "sig_cycle_ready", "sig_cycle_valid"], lower: ["sig_cycle_clock", "sig_cycle_reset_n", "sig_cycle_request", "sig_cycle_ready", "sig_cycle_valid"] });
});

test("Signal Split remains view-only when a legacy assignment is present", async ({ page }) => {
  await page.goto("/");
  const upper = page.getByTestId("cycle-surface");
  await expect(upper).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  await expect(page.getByTestId("cycle-surface-lower")).toBeVisible();
  await expect(page.getByLabel("Inspector signal split pane")).toHaveCount(0);
});
