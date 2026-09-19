import { expect, test } from "@playwright/test";

test("Transaction mode exposes no keyboard-operable left-pane separator", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator(".cycle-panel.mode-transaction")).toBeVisible();
  await expect(page.getByTestId("left-pane-resizer")).toHaveCount(0);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const separator = page.getByTestId("left-pane-resizer");
  await expect(separator).toHaveCount(1);
  const before = await separator.getAttribute("aria-valuenow");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  const after = await separator.getAttribute("aria-valuenow");
  expect(after).not.toBe(before);
});
