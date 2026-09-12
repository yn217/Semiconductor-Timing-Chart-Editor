import { expect, test } from "@playwright/test";

// Transaction Mode displays canonical system-cycle duration directly.
test("Transaction Inspector's Duration shows canonical cycles", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  const duration = inspector.locator(".property-row", { hasText: "Duration" });
  await expect(duration).toHaveText(/^Duration2 cycles$/);

});
