import { expect, test } from "@playwright/test";

test("Inspector section disclosure uses the same chevron glyphs as the trees", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
  const toggle = page.getByTestId("inspector").locator(".inspector-section-toggle").first();
  await expect(toggle).toBeVisible();
  const icon = toggle.locator("svg");
  await expect(icon).toHaveAttribute("data-icon", /^chevron-(down|right)$/);
  const treeIcon = page.getByTestId("transaction-left-tree").locator("svg[data-icon^='chevron']").first();
  const box = async (l: typeof icon) => (await l.boundingBox())!;
  expect((await box(icon)).width).toBe((await box(treeIcon)).width);
  const open = await toggle.getAttribute("aria-expanded");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", open === "true" ? "false" : "true");
  await expect(icon).toHaveAttribute("data-icon", open === "true" ? "chevron-right" : "chevron-down");
});
