import { expect, test } from "@playwright/test";

// #750: Duration is shown in TC with the canonical system-cycle count alongside; canonical time stays in cycles.
test("Transaction Inspector's Duration shows TC with the canonical cycle count", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  const duration = inspector.locator(".property-row", { hasText: "Duration" });
  await expect(duration).toHaveText(/^Duration0\.2 TC \(2 cycles\)$/);

});
