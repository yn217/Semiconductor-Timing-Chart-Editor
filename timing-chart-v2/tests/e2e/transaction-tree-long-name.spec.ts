import { expect, test } from "@playwright/test";

// Transaction Mode GUI realignment ("長い名前は ellipsis + tooltip...
// パネル外にはみ出さないこと"): the Left panel's per-Transaction row
// (.transaction-lane-label-row) already had CSS ellipsis truncation, but a
// truncated long name had no way to see the full text -- no title
// attribute. This verifies both halves of the reference requirement: the
// row never overflows its own panel, and the full name is available via a
// native tooltip once truncated.
test("a long Transaction name ellipsis-truncates without overflowing the Left panel, and shows the full name via tooltip", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const longName = "This_Is_A_Very_Long_Transaction_Name_That_Should_Not_Overflow_The_Panel_Boundary";
  await page.getByTestId("transaction-editor").getByLabel("Transaction name", { exact: true }).fill(longName);
  await page.getByTestId("transaction-editor").getByTestId("apply-transaction-properties").click();

  const row = page.locator("[data-testid^='transaction-tree-row-']").first();
  await expect(row).toHaveAttribute("title", longName);

  const rowBox = (await row.boundingBox())!;
  const labelsBox = (await page.locator(".transaction-lane-labels").boundingBox())!;
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(labelsBox.x + labelsBox.width + 1);
});
