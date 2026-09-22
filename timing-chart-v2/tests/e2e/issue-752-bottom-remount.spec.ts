import { expect, test } from "@playwright/test";

test("Bottom Transaction state survives primary selection changes", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");

  await bottom.getByTestId("transaction-list-search").fill("_0");
  await bottom.getByRole("button", { name: /Expand phases for Read_0/ }).click().catch(() => undefined);
  const rows = bottom.locator(".transaction-list-row > button[data-selected]");
  await rows.first().click();
  const name = page.getByLabel("Bottom Transaction name");
  const original = await name.inputValue();
  await name.fill(`${original}_DRAFT`);

  await rows.first().click();
  await expect(bottom.getByTestId("transaction-list-search")).toHaveValue("_0");
  await expect(page.getByLabel("Bottom Transaction name")).not.toHaveValue(`${original}_DRAFT`);

  await bottom.locator(".transaction-list-row > button[data-selected]", { hasText: original }).first().click();
  await expect(page.getByLabel("Bottom Transaction name")).toHaveValue(`${original}_DRAFT`);

  await page.getByLabel("Bottom Transaction name").press("Escape");
  await expect(page.getByLabel("Bottom Transaction name")).toHaveValue(original);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
});
