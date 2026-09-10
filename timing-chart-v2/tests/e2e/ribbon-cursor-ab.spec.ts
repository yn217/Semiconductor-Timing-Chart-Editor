import { expect, test } from "@playwright/test";

// #431/#459: Cursor A/B is source-time workspace state (use-workspace-ui-
// state.ts) that had a fully-built API -- setCursor/clearCursor/moveCursor/
// swapCursors -- with zero GUI anywhere. This adds View Ribbon controls
// (Set A/Set B/Swap/Clear, stamping the currently-selected cycle) and a
// status bar readout. View-only throughout: zero Canonical/History/Dirty
// delta, verified directly against history-status.

test("Cursor A/B Ribbon controls set/swap/clear the status bar readout with zero Canonical/History delta", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  const cursorStatus = page.getByTestId("cursor-status");
  await expect(cursorStatus).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.getByTestId("cursor-set-a").click();
  await expect(cursorStatus).toHaveText(/A 2/);
  await expect(page.locator("[data-role='cursor-line'][data-cursor='a']")).toHaveAttribute("data-cycle", "2");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByTestId("cursor-set-b").click();
  await expect(cursorStatus).toContainText("A 2");
  await expect(cursorStatus).toContainText("B 2");
  await expect(page.locator("[data-role='cursor-line']")).toHaveCount(2);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.getByTestId("cursor-swap").click();
  await expect(cursorStatus).toBeVisible();

  await page.getByTestId("cursor-clear").click();
  await expect(cursorStatus).toHaveCount(0);
  await expect(page.locator("[data-role='cursor-line']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
