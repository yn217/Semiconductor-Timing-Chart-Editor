import { expect, test } from "@playwright/test";

test("recycled Event Table rows keep the visible edit bound to its Signal and transition", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  const requestRow = page.locator("form.event-row[data-event-start='3']");
  await requestRow.getByRole("button", { name: /Edit transition/ }).click();
  await requestRow.getByLabel("Comment 3").fill("draft stays with REQUEST cycle 3");

  const eventTable = page.locator(".event-table-scroll");
  await eventTable.evaluate((element) => { element.scrollTop = 30; });
  await expect(requestRow.getByLabel("Comment 3")).toHaveValue("draft stays with REQUEST cycle 3");

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  await expect(page.locator(".editor-selection")).toHaveText("READY · Signal");
  await expect(page.locator("form.event-row[data-event-start='3'] input[aria-label='Comment 3']")).toHaveCount(0);

  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();
  await expect(page.locator(".editor-selection")).toHaveText("REQUEST · Signal");
  const restoredRow = page.locator("form.event-row[data-event-start='3']");
  await expect(restoredRow.getByRole("button", { name: /Edit transition/ })).toBeVisible();
  await expect(restoredRow.getByLabel("Comment 3")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
