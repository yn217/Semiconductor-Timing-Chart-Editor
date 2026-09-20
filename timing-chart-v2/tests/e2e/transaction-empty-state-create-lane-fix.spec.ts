import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// Found while adding the Bottom Panel toolbar's "Add" button: the
// empty-state "Create Transaction" form (shown when no Transaction is
// selected) defaults its own Lane field to an empty string, and
// transaction.create's schema requires laneId, when present at all, to be
// non-empty (SCHEMA_MINLENGTH) -- submitting that form without touching
// Lane silently failed the command with zero feedback. Genuinely
// pre-existing (introduced when the Lane default changed from "lane_0" to
// "" in a recent commit), not something this session's own toolbar
// addition created. Fixed by omitting laneId entirely when the field is
// left blank, matching how every other optional Transaction field here is
// already handled.
test("the empty-state Create Transaction form creates a Transaction without a Lane typed", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  const historyBefore = await page.getByTestId("history-status").textContent();
  await page.getByTestId("transaction-editor").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  await expect(page.locator("[data-transaction-id]")).toHaveCount(1);
});
