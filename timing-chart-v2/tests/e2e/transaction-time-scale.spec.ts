import { expect, test } from "@playwright/test";

// #397 Transaction Mode GUI Closure Section 4: `transaction.setTimeScale`
// already existed at the command/planner layer with zero GUI entry point --
// the status label always read "Time Scale: Cycle" regardless of
// `document.transactionTimeScale`. This adds and verifies the Ribbon's
// "Time Scale" entry point and the label reflecting the real value.

test("Transaction Time Scale is set through the Ribbon panel, reflected in the status label, and exact-Undo/Redo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  const timeScaleLabel = page.locator("span", { hasText: /^Time Scale:/ });
  await expect(timeScaleLabel).toHaveText("Time Scale: 1 TC = 1 Cycle");

  await page.getByTestId("transaction-time-scale-trigger").click();
  const panel = page.getByTestId("transaction-time-scale-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Clock cycles per Transaction Cycle").fill("4");
  await panel.getByLabel("Major tick interval").fill("8");
  await panel.getByLabel("Minor tick interval").fill("2");
  await page.getByTestId("transaction-time-scale-apply").click();
  await expect(panel).toHaveCount(0);

  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(timeScaleLabel).toHaveText("Time Scale: 1 TC = 4 Cycles");

  // Reopening reflects the current document value, not stale draft state.
  await page.getByTestId("transaction-time-scale-trigger").click();
  await expect(page.getByLabel("Clock cycles per Transaction Cycle")).toHaveValue("4");
  await expect(page.getByLabel("Major tick interval")).toHaveValue("8");
  await expect(page.getByLabel("Minor tick interval")).toHaveValue("2");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("transaction-time-scale-panel")).toHaveCount(0);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(timeScaleLabel).toHaveText("Time Scale: 1 TC = 1 Cycle");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(timeScaleLabel).toHaveText("Time Scale: 1 TC = 4 Cycles");
});

test("Transaction Time Scale panel rejects an invalid ratio and Cancel/Escape discard the draft", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  await page.getByTestId("transaction-time-scale-trigger").click();
  const panel = page.getByTestId("transaction-time-scale-panel");
  await panel.getByLabel("Clock cycles per Transaction Cycle").fill("0");
  await expect(page.getByTestId("transaction-time-scale-error")).toBeVisible();
  await expect(page.getByTestId("transaction-time-scale-apply")).toBeDisabled();

  await panel.getByLabel("Clock cycles per Transaction Cycle").fill("2");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.locator("span", { hasText: /^Time Scale:/ })).toHaveText("Time Scale: 1 TC = 1 Cycle");
});
