import { expect, test } from "@playwright/test";

// #397 Transaction Mode GUI Closure Section 9: the MiniMap is built purely
// from Signal/SignalGroup data with zero Transaction awareness -- in pure
// Transaction Mode it always rendered stale/irrelevant Signal rows
// regardless of what Transactions actually exist. Per the issue's own
// stated resolution ("show a real Transaction overview, or be
// default-off"), it is now hidden in Transaction Mode only; Cycle and Split
// (which still show real Signal content) are unaffected. View-only: no
// Canonical/History/dirty delta.

test("MiniMap hides in pure Transaction Mode but stays visible in Cycle and Split, view-only throughout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const minimap = page.getByTestId("minimap");
  const viewMode = page.locator(".view-mode");

  await expect(minimap).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await viewMode.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(minimap).toBeHidden();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await viewMode.getByRole("button", { name: "Split", exact: true }).click();
  await expect(minimap).toBeVisible();

  await viewMode.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(minimap).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
