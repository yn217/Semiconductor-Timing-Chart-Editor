import { expect, test } from "@playwright/test";

test("Bottom Phase editor preserves draft/validation and stable Phase identity through Start-order projection", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Phases", exact: true }).click();
  const tab = page.getByTestId("transaction-bottom-phases");
  await expect(tab).toBeVisible();
  await expect(tab.getByTestId("transaction-bottom-phase-context")).toContainText(/Start [\d.]+ · End [\d.]+ · Duration [\d.]+ (?:TC|cycles) · Coverage/);
  await expect(tab.getByRole("button", { name: /Move bottom phase/ })).toHaveCount(0);
  const apply = tab.getByTestId("apply-bottom-transaction-phases");
  await expect(apply).toBeDisabled();
  const headerBox = (await tab.locator("header").boundingBox())!;
  const tableBox = (await tab.locator(".transaction-bottom-phase-table").boundingBox())!;
  expect(headerBox.y).toBeLessThan(tableBox.y);
  expect((await apply.boundingBox())!.y).toBeLessThan(tableBox.y);

  await expect(tab.getByTestId("transaction-bottom-phase-timeline").locator(".transaction-bottom-phase-segment").first()).toBeVisible();
  await expect(tab.getByTestId("transaction-bottom-phase-coverage")).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();
  await tab.getByLabel("Bottom Phase 1 name").fill("");
  await expect(tab.getByTestId("transaction-bottom-phase-error")).toBeVisible();
  await expect(tab.getByTestId("transaction-bottom-phases-unapplied")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await tab.getByRole("button", { name: "Revert" }).click();
  await expect(tab.getByTestId("transaction-bottom-phase-error")).toHaveCount(0);
  await expect(apply).toBeDisabled();

  await tab.getByLabel("Bottom Phase 1 name").fill("KEEP_ME");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Linked Signals", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Phases", exact: true }).click();
  await expect(tab.getByLabel("Bottom Phase 1 name")).toHaveValue("KEEP_ME");
  await expect(tab.getByTestId("transaction-bottom-phases-unapplied")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await tab.getByRole("button", { name: "Revert" }).click();
  await expect(tab.getByLabel("Bottom Phase 1 name")).not.toHaveValue("KEEP_ME");

  // Continue the complementary stable-identity/order contract in this same production session.
  // The first draft was reverted above, so the Phase projection starts from canonical fixture data.
  const rows = tab.locator(".transaction-bottom-phase-table .transaction-bottom-phase-row[data-phase-uid]");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(2);
  const names = () => rows.evaluateAll((elements) => elements.map((element) => (element.querySelector("input") as HTMLInputElement).value));
  const starts = () => rows.evaluateAll((elements) => elements.map((element) => Number((element.querySelectorAll("input")[1] as HTMLInputElement).value)));
  const initialNames = await names();
  const initialStarts = await starts();
  expect([...initialStarts].sort((a, b) => a - b)).toEqual(initialStarts);
  await expect(page.getByTestId("history-status")).toHaveText(history);

  // Move the LAST phase's Start before everything else: it must jump to the top of the Start-time projection, keeping its name.
  const lastUid = await rows.nth(count - 1).getAttribute("data-phase-uid");
  const lastName = initialNames[count - 1]!;
  await rows.nth(count - 1).locator("input").nth(1).fill(String(initialStarts[0]! - 0));
  // The visible order is held while the row is being edited and re-projects once focus leaves it.
  await tab.getByTestId("transaction-bottom-phase-coverage").click();
  await tab.locator("input").first().evaluate((element) => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(async () => { const values = await starts(); return JSON.stringify([...values].sort((x, y) => x - y)) === JSON.stringify(values); }).toBe(true);
  const reordered = await starts();
  expect([...reordered].sort((a, b) => a - b)).toEqual(reordered);
  await expect(tab.locator(`.transaction-bottom-phase-row[data-phase-uid="${lastUid}"] input`).first()).toHaveValue(lastName);

  // Delete by the displayed first row that belongs to that phase: exactly that phase disappears.
  await tab.locator(`.transaction-bottom-phase-row[data-phase-uid="${lastUid}"] button`).click();
  await expect(tab.locator(`.transaction-bottom-phase-row[data-phase-uid="${lastUid}"]`)).toHaveCount(0);
  expect(await names()).toEqual(initialNames.slice(0, count - 1));

  // Validation: a blank name is one shared structured message, without the old "integer-cycle" wording.
  await tab.getByLabel("Bottom Phase 1 name").fill("");
  await expect(tab.getByTestId("transaction-bottom-phase-error")).toHaveText("Every Phase needs a name.");
  await expect(tab.getByTestId("transaction-bottom-phase-error")).not.toContainText(/integer-cycle/i);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await tab.getByRole("button", { name: "Revert" }).click();
  await expect(tab.getByTestId("transaction-bottom-phase-error")).toHaveCount(0);
});
