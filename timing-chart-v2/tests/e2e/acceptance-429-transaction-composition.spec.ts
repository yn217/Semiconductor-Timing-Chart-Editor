import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
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
  page.on("console", (message) => { if (message.type() === "warning") console.log(message.text()); });
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
  await expect(inspector.getByLabel("Transaction start")).toHaveValue(beforeResize);

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

test("Transaction demo is available after a browser reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?transaction-demo");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("Memory");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Memory");
  await page.reload();
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
  await expect(page.locator(".transaction-list-header-cells")).toContainText("# Phases");
  await expect(page.locator(".transaction-list-header-cells")).toContainText("Linked Signals");
});

test("Transaction sample is shown after reloading the default browser URL", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
  await page.reload();
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
});

test("Transaction Tree drag moves a transaction into another group", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const target = page.locator('[data-transaction-group-id="demo_tgrp_cpu"] .transaction-left-tree-group-header');
  await source.dragTo(target);
  await expect(page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_cpu"]')).toContainText("Read_0");
  await expect(page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_memory"]')).not.toContainText("Read_0");
});

test("Transaction Tree group drag is one undoable and redoable semantic operation", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const cpu = page.locator('[data-transaction-group-id="demo_tgrp_cpu"] .transaction-left-tree-group-header');
  const cpuGroup = page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_cpu"]');
  const memoryGroup = page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_memory"]');
  await source.dragTo(cpu);
  await expect(cpuGroup).toContainText("Read_0");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(memoryGroup).toContainText("Read_0");
  await expect(cpuGroup).not.toContainText("Read_0");
  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(cpuGroup).toContainText("Read_0");
  await expect(memoryGroup).not.toContainText("Read_0");
});

test("Transaction Tree group drag survives Save/Open", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  await source.dragTo(page.locator('[data-transaction-group-id="demo_tgrp_cpu"] .transaction-left-tree-group-header'));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(readFileSync(savedPath!, "utf8")) as { transactions: readonly { id: string; groupId?: string }[] };
  expect(saved.transactions.find((item) => item.id === "demo_txn_read")?.groupId).toBe("demo_tgrp_cpu");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_cpu"]')).toContainText("Read_0");
});

test("Center additive selection projects to Tree and Bottom", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const read = page.locator('[data-transaction-id="demo_txn_read"]');
  const write = page.locator('[data-transaction-id="demo_txn_write"]');
  await read.click();
  await write.click({ modifiers: ["Control"] });
  await expect(read).toHaveAttribute("data-selected", "true");
  await expect(write).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_write")).toHaveAttribute("data-selected", "true");
  await expect(page.locator('.transaction-list-row[data-transaction-row-id="demo_txn_read"] > button')).toHaveAttribute("data-selected", "true");
  await expect(page.locator('.transaction-list-row[data-transaction-row-id="demo_txn_write"] > button')).toHaveAttribute("data-selected", "true");
});

test("focused Transaction Tree row supports Delete shortcut", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const row = page.getByTestId("transaction-left-tree-row-demo_txn_other");
  await row.focus();
  await row.press("Delete");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_other")).toHaveCount(0);
  await expect(page.locator('[data-transaction-id="demo_txn_other"]')).toHaveCount(0);
  await expect(page.locator('[data-transaction-row-id="demo_txn_other"]')).toHaveCount(0);
});
test("Transaction Tree Shift-click selects all visible children in a group", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const tree = page.getByTestId("transaction-left-tree");
  const group = tree.locator('[data-transaction-group-id="demo_tgrp_memory"] .transaction-left-tree-group-header');
  await group.click({ modifiers: ["Shift"] });
  await expect(tree.locator('[data-transaction-tree-id="demo_txn_read"]')).toHaveAttribute("data-selected", "true");
  await expect(tree.locator('[data-transaction-tree-id="demo_txn_write"]')).toHaveAttribute("data-selected", "true");
  await expect(tree.locator('[data-transaction-tree-id="demo_txn_fetch"]')).toHaveAttribute("data-selected", "false");
});

test("Transaction Tree group header supports left and right collapse navigation", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const group = page.locator('[data-transaction-group-id="demo_tgrp_memory"]');
  const toggle = group.locator(".transaction-left-tree-group-header > button").first();
  await toggle.focus();
  await toggle.press("ArrowLeft");
  await expect(group.locator('[data-transaction-tree-id="demo_txn_read"]')).toHaveCount(0);
  await toggle.press("ArrowRight");
  await expect(group.locator('[data-transaction-tree-id="demo_txn_read"]')).toHaveCount(1);
});

test("Transaction Tree visibility control hides only the selected transaction projection", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const row = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const visibility = row.locator("..").locator(".transaction-left-tree-visibility");
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(1);
  await visibility.click();
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(0);
  await expect(row).toHaveCount(1);
  await visibility.click();
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(1);
});
