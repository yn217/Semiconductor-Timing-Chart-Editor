import { expect, test } from "@playwright/test";

test("builds six transactions through normal GUI selection transitions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]")).toHaveCount(0);
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const inspector = page.getByTestId("inspector");
  const ribbon = page.getByTestId("ribbon");
  const surface = page.getByTestId("cycle-surface");
  for (let index = 0; index < 6; index++) {
    await ribbon.getByRole("button", { name: "Create Transaction", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue(`Transaction ${index + 1}`);
    await inspector.getByLabel("Transaction name", { exact: true }).fill(["Read_0", "Write_0", "Fetch_0", "Execute_0", "SPI_0", "Transaction2"][index]!);
    await inspector.getByLabel("Transaction lane", { exact: true }).fill(`lane_${Math.min(index / 2, 2) | 0}`);
    await inspector.getByLabel("Transaction description", { exact: true }).fill("GUI authored transaction");
    await inspector.getByTestId("apply-inspector-transaction").click();
  }
  for (let index = 0; index < 3; index++) {
    await page.getByTestId("transaction-tree-more").click();
    await page.getByTestId("add-transaction-group-tree").click();
  }
  await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").first().click();
  await inspector.getByLabel("Transaction group", { exact: true }).selectOption({ label: "Group 1" });
  await expect(inspector.getByLabel("Transaction group", { exact: true })).toHaveValue(/.+/);
  await inspector.getByLabel("Transaction end", { exact: true }).fill("6");
  await inspector.getByLabel("Transaction lane", { exact: true }).fill("lane_0");
  for (let index = 0; index < 3; index++) {
    await inspector.getByTestId("add-transaction-phase").click();
    await expect(inspector.locator("[data-phase-index]")).toHaveCount(index + 1);
    await inspector.getByLabel(`Phase ${index + 1} name`).fill(["Address", "Read Data", "Response"][index]!);
  }
  await inspector.getByTestId("open-linked-signal-picker").click();
  await inspector.getByLabel("Search linked signals").fill("REQUEST");
  await inspector.getByRole("option", { name: /REQUEST/ }).click();
  await inspector.getByLabel("Transaction color").fill("#3366ff");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toContainText("History");
  await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").nth(1).click();
  await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").first().click();
  await expect(inspector.locator("[data-phase-index]")).toHaveCount(3);
  for (const [index, group] of [[1, "Group 1"], [2, "Group 2"], [3, "Group 2"], [4, "Group 3"]] as const) {
    await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").nth(index).click();
    await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue(["Read_0", "Write_0", "Fetch_0", "Execute_0", "SPI_0"][index]!);
    await inspector.getByLabel("Transaction group", { exact: true }).selectOption({ label: group });
    await inspector.getByTestId("apply-inspector-transaction").click();
  }
  await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").nth(5).click();
  await inspector.getByLabel("Transaction lane", { exact: true }).fill("lane_3");
  await inspector.getByTestId("apply-inspector-transaction").click();
  for (const [index, name] of ["Memory", "CPU", "Peripheral"].entries()) {
    const header = page.getByTestId("transaction-group-header").nth(index);
    await header.getByRole("textbox").fill(name);
    await header.getByRole("textbox").press("Enter");
  }
  await expect(page.getByTestId("transaction-editor").locator("[data-transaction-row-id]")).toHaveCount(6);
  await expect(page.getByTestId("transaction-editor")).toContainText("Read_0");
  await expect(page.getByTestId("transaction-editor")).toContainText("lane_3");
  await expect(page.getByTestId("transaction-editor").locator("[data-transaction-row-id]").first()).toContainText("GUI authored transaction");
  const save = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await (await save).path();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(saved!);
  await expect(page.getByTestId("transaction-editor")).toContainText("Memory");
  await expect(page.getByTestId("transaction-editor")).toContainText("lane_3");
  await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").first().click();
  await expect(inspector.getByLabel("Phase 1 name")).toHaveValue("Address");
  await expect(inspector.getByLabel("Phase 2 name")).toHaveValue("Read Data");
  await expect(inspector.getByLabel("Phase 3 name")).toHaveValue("Response");
  await expect(inspector.getByTestId("linked-signal-list")).toContainText("REQUEST");
});

test("authored transaction keeps its stable ID through one edit Undo/Redo, mode roundtrip, and Save/Open", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();

  const ribbon = page.getByTestId("ribbon");
  const tree = page.getByTestId("transaction-left-tree");
  const inspector = page.getByTestId("inspector");
  const surface = page.getByTestId("cycle-surface");
  await ribbon.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(tree.locator("[data-transaction-tree-id]")).toHaveCount(1);
  const authoredRow = tree.locator("[data-transaction-tree-id]");
  const authoredId = await authoredRow.getAttribute("data-transaction-tree-id");
  expect(authoredId).toBeTruthy();
  await authoredRow.click();

  const historyBeforeEdit = await page.getByTestId("history-status").textContent();
  const historyDepthBeforeEdit = Number(historyBeforeEdit?.match(/History (\d+)/)?.[1] ?? -1);
  const originalName = await inspector.getByLabel("Transaction name", { exact: true }).inputValue();
  const originalLane = await inspector.getByLabel("Transaction lane", { exact: true }).inputValue();
  await inspector.getByLabel("Transaction name", { exact: true }).fill("Authored_Read");
  await inspector.getByLabel("Transaction lane", { exact: true }).fill("lane_authored");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText(`History ${historyDepthBeforeEdit + 1} / Redo 0`);
  await expect(tree.locator(`[data-transaction-tree-id="${authoredId}"]`)).toContainText("Authored_Read");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText(`History ${historyDepthBeforeEdit} / Redo 1`);
  await expect(tree.locator(`[data-transaction-tree-id="${authoredId}"]`)).toHaveCount(1);
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue(originalName);
  await expect(inspector.getByLabel("Transaction lane", { exact: true })).toHaveValue(originalLane);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText(`History ${historyDepthBeforeEdit + 1} / Redo 0`);
  await expect(tree.locator(`[data-transaction-tree-id="${authoredId}"]`)).toContainText("Authored_Read");
  await expect(inspector.getByLabel("Transaction lane", { exact: true })).toHaveValue("lane_authored");

  for (const mode of ["Cycle", "Combined", "Transaction"] as const) {
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    await expect(page.locator(".view-mode").getByRole("button", { name: mode, exact: true })).toHaveClass(/active/);
  }
  await expect(tree.locator(`[data-transaction-tree-id="${authoredId}"]`)).toHaveCount(1);

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const reopenedRow = tree.locator(`[data-transaction-tree-id="${authoredId}"]`);
  await expect(reopenedRow).toHaveCount(1);
  await expect(reopenedRow).toContainText("Authored_Read");
  await reopenedRow.click();
  await expect(inspector.getByLabel("Transaction lane", { exact: true })).toHaveValue("lane_authored");
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
});
