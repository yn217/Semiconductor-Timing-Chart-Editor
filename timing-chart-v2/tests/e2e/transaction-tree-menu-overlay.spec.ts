import { expect, test } from "@playwright/test";
import { documentState, expectViewOnly } from "./view-only.js";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction Tree menus stay readable, anchored and view-only at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

    const tree = page.getByTestId("transaction-left-tree");
    const group = tree.locator('[data-transaction-group-id="demo_tgrp_memory"]');
    const groupTrigger = group.locator(".transaction-left-tree-group-header .transaction-left-tree-more");
    const groupHeader = group.locator(".transaction-left-tree-group-header");
    const menu = page.getByTestId("transaction-tree-action-menu");
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const viewOnlyBefore = await documentState(page);
    const headerBefore = await groupHeader.boundingBox();

    await groupTrigger.click();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS("position", "fixed");
    await expect(menu.getByRole("menuitem")).toHaveText(["Rename Group", "New Transaction", "Select Children", "Delete Group", "Show All", "Hide All"]);
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.width).toBeGreaterThanOrEqual(200);
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.y).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
    for (const item of await menu.getByRole("menuitem").all()) {
      const box = (await item.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(30);
    }
    expect(await groupHeader.boundingBox()).toEqual(headerBefore);
    await expect(menu.getByRole("menuitem", { name: "Rename Group" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "New Transaction" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(groupTrigger).toBeFocused();

    const transactionRow = tree.getByTestId("transaction-left-tree-row-demo_txn_read");
    const transactionTrigger = transactionRow.locator("..").locator(".transaction-left-tree-more");
    await transactionTrigger.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toContainText(["Focus in Timeline", "Move to Group", "Duplicate", "Delete"]);
    const transactionMenuBox = (await menu.boundingBox())!;
    expect(transactionMenuBox.x).toBeGreaterThanOrEqual(0);
    expect(transactionMenuBox.x + transactionMenuBox.width).toBeLessThanOrEqual(viewport.width);
    expect(transactionMenuBox.y + transactionMenuBox.height).toBeLessThanOrEqual(viewport.height);
    await page.getByText("All Transactions", { exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(transactionTrigger).toBeFocused();

    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
    await expectViewOnly(page, viewOnlyBefore);
  });
}
