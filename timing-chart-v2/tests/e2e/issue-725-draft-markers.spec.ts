import { expect, test } from "@playwright/test";

test("edited Bottom row cells show a draft marker and double-click focuses the editor", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  const rows = bottom.locator(".transaction-list-row > button[data-selected]");
  await rows.first().click();
  const name = page.getByLabel("Bottom Transaction name");
  await expect(name).toHaveAttribute("data-draft-dirty", "false");
  await rows.first().dblclick();
  await name.fill("Draft Name");
  await expect(name).toHaveAttribute("data-draft-dirty", "true");
  await expect(page.getByLabel("Bottom Transaction description")).toHaveAttribute("data-draft-dirty", "false");
  await name.press("Escape");
  await expect(name).toHaveAttribute("data-draft-dirty", "false");
});
