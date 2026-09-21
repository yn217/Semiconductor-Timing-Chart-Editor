import { expect, test } from "@playwright/test";

// #759: Left Tree and center Group headers share one disclosure owner; view-only; survives mode switches; unrelated edits keep it.
test("Group disclosure is one shared, view-only state across Tree, center headers and Combined", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const canon = () => page.evaluate(() => [document.querySelector("[data-testid='revision-status']")?.textContent, document.querySelector("[data-testid='history-status']")?.textContent, document.querySelector("[data-testid='dirty-status']")?.textContent]);
  const before = await canon();
  const treeChevron = page.locator(".transaction-left-tree").getByRole("button", { name: /^(Collapse|Expand) (?!All Transactions|Ungrouped)/ }).first();
  await expect(treeChevron).toBeVisible();
  const label = (await treeChevron.getAttribute("aria-label"))!.replace(/^(Collapse|Expand) /, "");
  const centerChevron = page.locator(".transaction-group-header-chevron", { has: page.locator(`xpath=self::*[contains(@aria-label, "${label}")]`) }).first();
  const centerByLabel = page.locator(`.transaction-group-header-chevron[aria-label$="${label}"]`).first();
  void centerChevron;
  await expect(centerByLabel).toHaveAttribute("aria-expanded", "true");
  // Tree -> center.
  await treeChevron.click();
  await expect(centerByLabel).toHaveAttribute("aria-expanded", "false");
  // Center -> Tree.
  await centerByLabel.click();
  await expect(treeChevron).toHaveAttribute("aria-expanded", "true");
  await expect(centerByLabel).toHaveAttribute("aria-expanded", "true");
  // Collapse from the center; it persists across Transaction -> Combined -> Transaction and matches the Tree in each.
  await centerByLabel.click();
  await expect(treeChevron).toHaveAttribute("aria-expanded", "false");
  for (const mode of ["Combined", "Transaction"]) {
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByTestId("transaction-lanes")).toBeVisible();
    await expect(treeChevron).toHaveAttribute("aria-expanded", "false");
    await expect(centerByLabel).toHaveAttribute("aria-expanded", "false");
  }
  expect(await canon()).toEqual(before);
});
