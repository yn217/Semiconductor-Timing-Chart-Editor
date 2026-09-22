import { expect, test } from "@playwright/test";

test("Bottom Transaction table sorts by Start as view state only", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const names = () => page.getByTestId("bottom-editor").locator(".transaction-list-row > button b").allInnerTexts();
  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const original = await names();
  await page.getByTestId("transaction-sort-key").selectOption("start");
  const starts = await page.getByTestId("bottom-editor").locator(".transaction-list-row > button").evaluateAll((rows) => rows.map((row) => Number(row.querySelectorAll("span")[2]?.textContent)));
  expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  await page.getByTestId("transaction-sort-direction").click();
  const startsDesc = await page.getByTestId("bottom-editor").locator(".transaction-list-row > button").evaluateAll((rows) => rows.map((row) => Number(row.querySelectorAll("span")[2]?.textContent)));
  expect([...startsDesc].sort((a, b) => b - a)).toEqual(startsDesc);
  await page.getByTestId("transaction-sort-key").selectOption("document");
  expect(await names()).toEqual(original);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
});
