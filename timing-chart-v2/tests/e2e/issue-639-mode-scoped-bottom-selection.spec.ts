import { expect, test } from "@playwright/test";

test("selection following never activates a Bottom tab absent from the current mode", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const mode = page.locator(".view-mode");
  const bottomTabs = page.getByTestId("bottom-tabs");
  const tabpanel = page.getByRole("tabpanel");

  // A Transaction may be created from the Home ribbon in Cycle mode, but
  // Cycle's Bottom tab set has no Transaction tab.
  await mode.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Signal" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Create Transaction" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(bottomTabs.getByRole("tab", { name: "Signal" })).toHaveAttribute("aria-selected", "true");
  await expect(tabpanel).toHaveAttribute("aria-labelledby", "bottom-tab-signal");
  await expect(page.getByTestId("signal-editor")).toBeVisible();

  // A Cycle Signal created through Insert in Transaction mode is another
  // cross-mode selection; it must not replace the Transaction tab content.
  await mode.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Transaction" })).toHaveAttribute("aria-selected", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: "Signal", exact: true }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Transaction" })).toHaveAttribute("aria-selected", "true");
  await expect(tabpanel).toHaveAttribute("aria-labelledby", "bottom-tab-transaction");
  await expect(page.getByTestId("transaction-editor")).toBeVisible();
  await expect(page.getByTestId("signal-editor")).toHaveCount(0);

  // Annotation selection is also outside Transaction mode's tab union.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Transaction" })).toHaveAttribute("aria-selected", "true");
  await expect(tabpanel).toHaveAttribute("aria-labelledby", "bottom-tab-transaction");
  await expect(page.getByTestId("transaction-editor")).toBeVisible();
  await expect(page.getByTestId("annotation-editor")).toHaveCount(0);
});
