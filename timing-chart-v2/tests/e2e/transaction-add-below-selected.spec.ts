import { expect, test } from "@playwright/test";

/**
 * "Add Transaction" puts the new Transaction directly below the selected one, in the same Group and Lane (it used to append to
 * Ungrouped, forcing a manual move every time). With nothing selected it still appends to Ungrouped.
 */
test("Tree Add and Bottom Add insert below the selected Transaction in its Group and Lane", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const tree = page.locator(".transaction-left-tree-row[data-transaction-tree-id]");
  await expect(tree.first()).toBeVisible({ timeout: 30_000 });
  const treeOrder = () => tree.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.transactionTreeId!));
  const groupOf = (id: string) => page.evaluate((target) => {
    const row = document.querySelector<HTMLElement>(`.transaction-left-tree-row[data-transaction-tree-id="${target}"]`)!;
    // nearest preceding group heading text in the tree
    let node: Element | null = row.closest(".transaction-left-tree-row-wrap") ?? row;
    for (; node; node = node.previousElementSibling) if (node.matches?.("[data-transaction-tree-group-id], .transaction-left-tree-group-row, [data-testid='transaction-tree-group']")) return node.textContent ?? "";
    return "";
  }, id);

  const before = await treeOrder();
  const read = before.find((id) => /read/i.test(id)) ?? before[0]!;
  // Select the first Memory-group Transaction and Add from the tree header.
  await tree.filter({ has: page.locator(`xpath=self::*[@data-transaction-tree-id="${read}"]`) }).first().click();
  await page.getByTestId("add-transaction-tree").click();
  await page.getByTestId("add-transaction-menu-item").click();
  await expect.poll(async () => (await treeOrder()).length).toBe(before.length + 1);
  const after = await treeOrder();
  const created = after.find((id) => !before.includes(id))!;
  // Directly below the selected Transaction, not at the end / in Ungrouped.
  expect(after.indexOf(created)).toBe(after.indexOf(read) + 1);
  expect(await groupOf(created)).toBe(await groupOf(read));
  // Bottom table shows the same Group and Lane as the selected one.
  const bottomRow = (id: string) => page.locator(`[data-transaction-row-id="${id}"]`);
  await expect(bottomRow(created)).toContainText(await bottomRow(read).locator("span").nth(0).textContent() ?? "");

  // Bottom toolbar Add: the created Transaction is selected, so Add again lands directly below it, in the same Group.
  await page.getByTestId("bottom-transaction-add").click();
  await expect.poll(async () => (await treeOrder()).length).toBe(before.length + 2);
  const after2 = await treeOrder();
  const created2 = after2.find((id) => !after.includes(id))!;
  expect(after2.indexOf(created2)).toBe(after2.indexOf(created) + 1);
  expect(await groupOf(created2)).toBe(await groupOf(read));
});
