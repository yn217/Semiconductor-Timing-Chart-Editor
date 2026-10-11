import { expect, test } from "@playwright/test";

/**
 * Group row menu > "New Transaction" must create the Transaction INSIDE that Group (it used to fall into Ungrouped), as one
 * Undo-able command, and select it.
 */
test("Group row menu New Transaction creates the Transaction in that Group", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("add-transaction-tree")).toBeVisible({ timeout: 30_000 });
  const history = page.getByTestId("history-status");
  const before = (await history.textContent())!;
  const lanes = page.getByTestId("transaction-lanes");
  const groupIds = () => lanes.locator("[data-testid='transaction-group-header']:not([data-ungrouped='true'])").evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.transactionGroupId!));
  const groupsBefore = new Set(await groupIds());
  await page.getByTestId("add-transaction-tree").click();
  await page.getByTestId("add-transaction-group-menu-item").click();
  // Startup groups have custom names, so the lowest free "Group N" is Group 1.
  const groupName = "Group 1";
  await expect(page.getByRole("button", { name: `More actions for ${groupName}` })).toBeVisible();

  const transactionIds = () => page.getByTestId("transaction-lanes").locator("[data-transaction-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-transaction-id")!));
  const idsBefore = new Set(await transactionIds());
  const ungroupedLocator = lanes.locator("[data-testid='transaction-group-header'][data-ungrouped='true']");
  const ungroupedCount = async () => (await ungroupedLocator.textContent())?.match(/\((\d+)\)/)?.[1];
  const ungroupedBefore = await ungroupedCount();
  await page.getByRole("button", { name: `More actions for ${groupName}` }).click();
  await page.getByRole("menuitem", { name: "New Transaction" }).click();

  // The new Transaction counts toward the Group's own header (1) and not toward Ungrouped.
  await expect.poll(async () => (await transactionIds()).filter((id) => !idsBefore.has(id)).length).toBe(1);
  const newGroupId = (await groupIds()).find((id) => !groupsBefore.has(id))!;
  await expect(lanes.locator(`[data-testid='transaction-group-header'][data-transaction-group-id='${newGroupId}']`)).toContainText("(1)");
  expect(await ungroupedCount(), "Ungrouped must not receive the new Transaction").toBe(ungroupedBefore);
  // Group + Transaction are two history entries; one Undo removes only the Transaction.
  await expect(history).not.toHaveText(before);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await transactionIds()).filter((id) => !idsBefore.has(id)).length).toBe(0);
});
