import { expect, test } from "@playwright/test";

test("builds six transactions through normal GUI selection transitions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const inspector = page.getByTestId("inspector");
  const ribbon = page.getByTestId("ribbon");
  for (let index = 0; index < 6; index++) {
    await ribbon.getByRole("button", { name: "Create Transaction", exact: true }).click();
    await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue(`Transaction ${index + 1}`);
    await inspector.getByLabel("Transaction name", { exact: true }).fill(["Read_0", "Write_0", "Fetch_0", "Execute_0", "SPI_0", "Transaction2"][index]!);
    await inspector.getByLabel("Transaction lane", { exact: true }).fill(`lane_${Math.min(index / 2, 2) | 0}`);
    await inspector.getByLabel("Transaction description", { exact: true }).fill("GUI authored transaction");
    await inspector.getByTestId("apply-inspector-transaction").click();
  }
  for (let index = 0; index < 3; index++) await page.getByTestId("add-transaction-group-tree").click();
  await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").first().click();
  await inspector.getByLabel("Transaction group", { exact: true }).selectOption({ label: "Group 1" });
  await inspector.getByLabel("Transaction lane", { exact: true }).fill("lane_0");
  await inspector.getByTestId("add-transaction-phase").click();
  await inspector.getByTestId("add-transaction-phase").click();
  await inspector.getByTestId("add-transaction-phase").click();
  for (let index = 0; index < 3; index++) await inspector.getByLabel(`Phase ${index + 1} name`).fill(["Address", "Read Data", "Response"][index]!);
  await inspector.getByTestId("open-linked-signal-picker").click();
  await inspector.getByLabel("Search linked signals").fill("REQUEST");
  await inspector.getByRole("option", { name: /REQUEST/ }).click();
  await inspector.getByLabel("Transaction color").fill("#3366ff");
  await inspector.getByTestId("apply-inspector-transaction").click();
  for (const [index, group] of [[1, "Group 1"], [2, "Group 2"], [3, "Group 2"], [4, "Group 3"]] as const) {
    await page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").nth(index).click();
    await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue(["Read_0", "Write_0", "Fetch_0", "Execute_0", "SPI_0"][index]!);
    await inspector.getByLabel("Transaction group", { exact: true }).selectOption({ label: group });
    await inspector.getByTestId("apply-inspector-transaction").click();
  }
  await expect(page.getByTestId("transaction-editor").locator("[data-transaction-row-id]")).toHaveCount(6);
  await expect(page.getByTestId("transaction-editor")).toContainText("Read_0");
  await expect(page.getByTestId("transaction-editor")).toContainText("lane_2");
});
