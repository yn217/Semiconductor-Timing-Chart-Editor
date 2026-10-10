import { expect, test } from "@playwright/test";

// Review fix: auto-named Transaction Groups used `order = groups.length`, so
// after deleting a middle Group a new Group collided with a survivor on both
// name ("Group N" twice) and order. The fixture already seeds Groups, so the
// names are read back from the DOM rather than assumed.

const groupNameInputs = 'input[aria-label^="Rename Group "]';

test("a Group created after deleting a middle Group gets a unique name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  const groupNames = () => page.locator(groupNameInputs).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  const before = await groupNames();

  for (let index = 0; index < 3; index += 1) {
    await page.getByTestId("transaction-tree-more").click();
    await page.getByTestId("add-transaction-group-tree").click();
    await expect(page.locator(groupNameInputs)).toHaveCount(before.length + index + 1);
  }
  const created = (await groupNames()).filter((name) => !before.includes(name));
  expect(created).toHaveLength(3);

  // Delete the middle of the three new Groups.
  await page.getByRole("button", { name: `Ungroup ${created[1]}`, exact: true }).click();
  await expect(page.locator(groupNameInputs)).toHaveCount(before.length + 2);

  await page.getByTestId("transaction-tree-more").click();
  await page.getByTestId("add-transaction-group-tree").click();
  await expect(page.locator(groupNameInputs)).toHaveCount(before.length + 3);

  const names = await groupNames();
  expect(new Set(names).size).toBe(names.length);
});
