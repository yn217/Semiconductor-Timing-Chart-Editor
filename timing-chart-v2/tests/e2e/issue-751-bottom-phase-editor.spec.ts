import { expect, test } from "@playwright/test";

test("Bottom Phases tab shows parent context, top Apply/Revert and live validation", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Phases", exact: true }).click();
  const tab = page.getByTestId("transaction-bottom-phases");
  await expect(tab).toBeVisible();
  await expect(page.getByTestId("transaction-bottom-phase-context")).toContainText(/Start \d+ · End \d+ · Duration \d+ cycles · Coverage/);
  await expect(tab.getByRole("button", { name: /Move bottom phase/ })).toHaveCount(0);
  const apply = tab.getByTestId("apply-bottom-transaction-phases");
  await expect(apply).toBeDisabled();
  const headerBox = (await tab.locator("header").boundingBox())!;
  const tableBox = (await tab.locator(".transaction-bottom-phase-table").boundingBox())!;
  expect(headerBox.y).toBeLessThan(tableBox.y);
  expect((await apply.boundingBox())!.y).toBeLessThan(tableBox.y);

  await expect(page.getByTestId("transaction-bottom-phase-timeline").locator(".transaction-bottom-phase-segment").first()).toBeVisible();
  await expect(page.getByTestId("transaction-bottom-phase-coverage")).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();
  await tab.getByLabel("Bottom Phase 1 name").fill("");
  await expect(tab.getByTestId("transaction-bottom-phase-error")).toBeVisible();
  await expect(page.getByTestId("transaction-bottom-phases-unapplied")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await tab.getByRole("button", { name: "Revert" }).click();
  await expect(tab.getByTestId("transaction-bottom-phase-error")).toHaveCount(0);
  await expect(apply).toBeDisabled();

  await tab.getByLabel("Bottom Phase 1 name").fill("KEEP_ME");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Linked Signals", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Phases", exact: true }).click();
  await expect(page.getByTestId("transaction-bottom-phases").getByLabel("Bottom Phase 1 name")).toHaveValue("KEEP_ME");
  await expect(page.getByTestId("transaction-bottom-phases-unapplied")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await page.getByTestId("transaction-bottom-phases").getByRole("button", { name: "Revert" }).click();
  await expect(page.getByTestId("transaction-bottom-phases").getByLabel("Bottom Phase 1 name")).not.toHaveValue("KEEP_ME");
});
