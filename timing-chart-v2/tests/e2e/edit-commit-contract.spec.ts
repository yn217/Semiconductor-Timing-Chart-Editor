import { expect, test } from "@playwright/test";

test("Inspector and Bottom expose the documented edit contract surfaces", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Inspector signal name")).toBeVisible();
  await expect(inspector.getByTestId("apply-inspector-signal")).toBeVisible();
  await expect(inspector.getByLabel("Inspector signal visible")).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Signal", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Annotation", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Problems", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "JSON", exact: true })).toBeVisible();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Transaction", exact: true })).toBeVisible();
  await expect(page.getByTestId("follow-selection")).toBeVisible();
  await expect(page.getByTestId("bottom-pin")).toBeVisible();
});
