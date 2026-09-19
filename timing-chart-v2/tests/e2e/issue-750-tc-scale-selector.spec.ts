import { expect, test } from "@playwright/test";

test("Transaction header exposes a cycles-per-TC selector that is one undoable edit", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const select = page.getByTestId("transaction-tc-scale");
  await expect(select).toBeVisible();
  const current = await select.inputValue();
  const target = current === "5" ? "20" : "5";
  await expect(select.locator("option")).toContainText(["1", "2", "4", "5", "10", "20", "50"]);
  const history = page.getByTestId("history-status");
  await expect(history).toHaveText("History 0 / Redo 0");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const rowBefore = await page.getByTestId("bottom-editor").locator(".transaction-list button", { hasText: "Read_0" }).first().innerText();

  await select.selectOption(target);
  await expect(history).toHaveText("History 1 / Redo 0");
  await expect(select).toHaveValue(target);
  expect(await page.getByTestId("bottom-editor").locator(".transaction-list button", { hasText: "Read_0" }).first().innerText()).toBe(rowBefore);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(select).toHaveValue(current);
  await expect(history).toHaveText("History 0 / Redo 1");
});
