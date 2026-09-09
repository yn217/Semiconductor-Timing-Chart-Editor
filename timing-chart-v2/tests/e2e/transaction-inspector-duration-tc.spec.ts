import { expect, test } from "@playwright/test";

// Transaction Mode GUI realignment: the reference Inspector shows
// "Duration: 50 TC (500 clock cycles)" -- Transaction Mode's own semantic
// unit is the Transaction Cycle (TC), the same unit already explained by
// the Ribbon's own Time Scale readout. Plain "N cycles" was ambiguous
// about which cycle domain (raw signal cycle vs Transaction Cycle) it
// meant.
test("Transaction Inspector's Duration shows TC, plus the real clock-cycle count when a Time Scale is set", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  const duration = inspector.locator(".property-row", { hasText: "Duration" });
  // No Time Scale set: plain TC count, no parenthetical.
  await expect(duration).toHaveText(/^Duration2 TC$/);

  await page.getByTestId("transaction-time-scale-trigger").click();
  const panel = page.getByTestId("transaction-time-scale-panel");
  await panel.getByLabel("Clock cycles per Transaction Cycle").fill("10");
  await page.getByTestId("transaction-time-scale-apply").click();

  await expect(duration).toHaveText(/^Duration2 TC \(20 clock cycles\)$/);
});
