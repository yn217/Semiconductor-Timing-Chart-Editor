import { expect, test } from "@playwright/test";

const viewports = [
  { width: 1672, height: 941 },
  { width: 1280, height: 720 },
];

for (const viewport of viewports) {
  test(`Transaction Tree action columns match at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

    const tree = page.getByTestId("transaction-left-tree");
    const memory = tree.locator('[data-transaction-group-id="demo_tgrp_memory"]');
    const readRow = tree.getByTestId("transaction-left-tree-row-demo_txn_read");
    const visibility = readRow.locator("..").locator(".transaction-left-tree-visibility");
    await expect(memory.locator(".transaction-left-tree-group-header .transaction-left-tree-more")).toHaveCount(1);
    await expect(tree.locator(".transaction-left-tree-rename")).toHaveCount(0);
    await expect(visibility).toHaveAttribute("aria-pressed", "true");
    await expect(visibility.locator("[data-icon]")).toHaveAttribute("data-icon", "eye");

    const actionCenters = async () => tree.evaluate((root) => {
      const center = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return rect.left + rect.width / 2;
      };
      const groupMore = [...root.querySelectorAll(".transaction-left-tree-group-header > .transaction-left-tree-more")].map(center);
      const transactionMore = [...root.querySelectorAll(".transaction-left-tree-row-actions > .transaction-left-tree-more")].map(center);
      const visibility = [...root.querySelectorAll(".transaction-left-tree-visibility")].map(center);
      return { groupMore, transactionMore, visibility };
    });
    const expectAligned = (centers: number[]) => {
      expect(centers.length).toBeGreaterThan(0);
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    };

    const before = await actionCenters();
    expectAligned([...before.groupMore, ...before.transactionMore]);
    expectAligned(before.visibility);

    await memory.locator(".transaction-left-tree-group-header .transaction-left-tree-more").click();
    await page.getByTestId("transaction-tree-action-menu").getByRole("menuitem", { name: "Rename Group" }).click();
    const rename = memory.getByRole("textbox", { name: "Rename Memory" });
    await rename.fill("Memory Very Long Group Name For Column Alignment");
    await rename.press("Enter");
    await rename.press("Escape");
    await expect(memory).toContainText("Memory Very Long Group Name For Column Alignment");

    const after = await actionCenters();
    expectAligned([...after.groupMore, ...after.transactionMore]);
    expectAligned(after.visibility);
    expect(Math.abs(after.groupMore[0]! - before.groupMore[0]!)).toBeLessThanOrEqual(1);
    await expect(readRow).toBeVisible();

    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(memory).toContainText("Memory");
    await expect(page.getByTestId("history-status")).toContainText("Redo 1");

    await visibility.click();
    await expect(visibility).toHaveAttribute("aria-pressed", "false");
    await expect(visibility.locator("[data-icon]")).toHaveAttribute("data-icon", "eye-off");
    await expect(page.getByTestId("history-status")).toContainText("History 1 / Redo 0");
    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(visibility).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("history-status")).toContainText("History 0 / Redo 1");
  });
}
