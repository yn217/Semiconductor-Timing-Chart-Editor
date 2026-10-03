import { expect, test } from "@playwright/test";

// Transaction names are owned by the authoritative left Tree; the center
// Lane label plane must not duplicate them or let rows escape its band.
test("a long Transaction name ellipsis-truncates without overflowing the Left panel, and shows the full name via tooltip", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const longName = "This_Is_A_Very_Long_Transaction_Name_That_Should_Not_Overflow_The_Panel_Boundary";
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Transaction name", { exact: true }).fill(longName);
  await inspector.getByTestId("apply-inspector-transaction").click();

  const row = page.locator(".transaction-left-tree-row").filter({ hasText: longName });
  await expect(row).toHaveAttribute("title", longName);
  const staysInsidePanel = await row.evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(staysInsidePanel).toBe(true);
  await expect(page.locator(".transaction-lane-label-row")).toHaveCount(0);
});
