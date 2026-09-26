import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/showcase/24_protocol_transaction_showcase.tcd.json");

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
test(`peer menus replace each other at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(fixture);
  const row = surface.locator("[data-role='frozen-row'][data-row-id='preset_n']");
  await expect(row).toBeVisible();
  await row.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  const rowMenu = page.getByTestId("signal-context-menu");
  await expect(rowMenu).toBeVisible();

  await page.getByRole("button", { name: "More tree actions", exact: true }).click();
  const headerMenu = page.getByRole("menu", { name: "More tree actions" });
  await expect(headerMenu).toBeVisible();
  const headerTrigger = page.getByRole("button", { name: "More tree actions", exact: true });
  await expect(headerMenu.getByRole("menuitem").first()).toBeFocused();

  // Contract: the new peer menu replaces the row context menu, rather than
  // leaving its stale target active behind the header menu.
  await expect(rowMenu).toHaveCount(0);
  await expect(headerMenu.getByRole("menuitem")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(headerMenu).toHaveCount(0);
  await expect(headerTrigger).toBeFocused();

  await headerTrigger.click();
  await expect(headerMenu).toBeVisible();
  await row.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  await expect(rowMenu).toBeVisible();
  await expect(headerMenu).toHaveCount(0);

  await expect(surface).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const transactionRow = page.getByTestId("transaction-left-tree-row-tx24_apb_w");
  await expect(transactionRow).toBeVisible();
  await transactionRow.locator("..").getByRole("button", { name: "More actions for APB write" }).click();
  const transactionMenu = page.getByTestId("transaction-tree-action-menu");
  await expect(transactionMenu).toBeVisible();
  await page.locator(".home-overflow-trigger").click();
  await expect(page.getByRole("menu", { name: "More Home Commands" })).toBeVisible();
  await expect(transactionMenu).toHaveCount(0);
});
}
