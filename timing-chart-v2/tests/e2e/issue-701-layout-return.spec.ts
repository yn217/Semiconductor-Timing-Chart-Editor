import { expect, test } from "@playwright/test";

test("Layout Inspector is reachable again after clearing the Transaction selection", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const heading = page.getByTestId("inspector").locator("h2, h3").first();
  await expect(heading).toHaveText("Layout");
  const history = await page.getByTestId("history-status").innerText();
  const row = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  await row.click();
  await expect(heading).not.toHaveText("Layout");
  const tree = page.getByTestId("transaction-left-tree");
  const box = (await tree.boundingBox())!;
  await tree.click({ position: { x: 120, y: Math.min(box.height, 700) - 30 } });
  await expect(heading).toHaveText("Layout");
  await row.click();
  await expect(heading).not.toHaveText("Layout");
  await row.press("Escape");
  await expect(heading).toHaveText("Layout");
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
