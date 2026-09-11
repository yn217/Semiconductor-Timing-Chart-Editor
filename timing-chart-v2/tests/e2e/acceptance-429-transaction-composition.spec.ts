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
    // Match the approved Reference's visible selection state before capturing
    // the region comparison: Read_0 is selected across the shared surfaces.
    await page.getByTestId("transaction-left-tree-row-txn_read0").click();

    await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Memory");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
    await expect(page.getByTestId("transaction-list-toolbar")).toContainText("Add");
    await expect(page.getByTestId("transaction-list-toolbar")).toContainText("Delete");
    await expect(page.getByTestId("transaction-list-search")).toBeVisible();
    await expect(page.getByTestId("delete-bottom-transaction")).toBeHidden();
    await expect(page.getByText(/^Editing:/)).toBeHidden();
    for (const heading of ["Name", "Group", "Lane", "Start (TC)", "End (TC)", "Duration", "# Phases", "Linked Signals", "Color", "Description"]) {
      await expect(page.locator(".transaction-list-header-cells")).toContainText(heading);
    }
    await expect(page.locator(".inspector > .minimap .minimap-segment-transaction").first()).toBeVisible();
    await page.screenshot({ path: `test-results/transaction-composition-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}

test("Transaction canvas body and edge drags commit through the semantic command path", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const bar = page.locator('[data-transaction-id="txn_read0"]');
  await bar.click();
  const inspector = page.getByTestId("inspector");
  const initialStart = await inspector.getByLabel("Transaction start").inputValue();
  const body = bar.locator(":scope > span").first();
  const bodyBox = await body.boundingBox();
  expect(bodyBox).not.toBeNull();
  await page.mouse.move(bodyBox!.x + bodyBox!.width / 2, bodyBox!.y + bodyBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bodyBox!.x + bodyBox!.width / 2 + 24, bodyBox!.y + bodyBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(inspector.getByLabel("Transaction start")).not.toHaveValue(initialStart);

  const startHandle = bar.locator(":scope > i[data-edge='start']");
  const startBox = await startHandle.boundingBox();
  expect(startBox).not.toBeNull();
  const beforeResize = await inspector.getByLabel("Transaction start").inputValue();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + 12, startBox!.y + startBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(inspector.getByLabel("Transaction start")).not.toHaveValue(beforeResize);

  const endHandle = bar.locator(":scope > i[data-edge='end']");
  const endBox = await endHandle.boundingBox();
  expect(endBox).not.toBeNull();
  const beforeEndResize = await inspector.getByLabel("Transaction end").inputValue();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + 14, endBox!.y + endBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(inspector.getByLabel("Transaction end")).not.toHaveValue(beforeEndResize);
});
