import { expect, test } from "@playwright/test";

test("Transaction header exposes a cycles-per-TC view preference without canonical history changes", async ({ page }) => {
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
  const readRow = () => page.getByTestId("bottom-editor").locator(".transaction-list button", { hasText: "Read_0" }).first();
  const rowBefore = (await readRow().locator(":scope > *").allInnerTexts()).map((text) => text.trim());

  await select.selectOption(target);
  await expect(history).toHaveText("History 0 / Redo 0");
  await expect(select).toHaveValue(target);
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  // Presentation only: name/group/lane cells are untouched; Start/End/Duration are re-expressed in the new unit (10 -> 5 or 20 cycles/TC).
  const rowAfter = (await readRow().locator(":scope > *").allInnerTexts()).map((text) => text.trim());
  expect(rowAfter.slice(0, 3)).toEqual(rowBefore.slice(0, 3));
  expect(rowAfter.slice(3, 6).join("|")).not.toBe(rowBefore.slice(3, 6).join("|"));
  expect(Number(rowAfter[3]) * Number(target)).toBeCloseTo(Number(rowBefore[3]) * Number(current), 2);

});
