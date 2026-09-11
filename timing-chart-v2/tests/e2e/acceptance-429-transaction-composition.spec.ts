import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const samplePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction reference composition at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.getByRole("tab", { name: "Transaction", exact: true }).click();

    await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Memory");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
    await expect(page.getByTestId("transaction-list-toolbar")).toContainText("Add");
    await expect(page.getByTestId("transaction-list-toolbar")).toContainText("Delete");
    await expect(page.getByTestId("transaction-list-search")).toBeVisible();
    for (const heading of ["Name", "Group", "Lane", "Start (TC)", "End (TC)", "Duration", "# Phases", "Linked Signals", "Color", "Description"]) {
      await expect(page.locator(".transaction-list-header-cells")).toContainText(heading);
    }
    await expect(page.locator(".inspector > .minimap .minimap-segment-transaction").first()).toBeVisible();
    await page.screenshot({ path: `test-results/transaction-composition-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}
