import { expect, test } from "@playwright/test";

test("Transaction Inspector uses a bounded searchable linked-signal picker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  const editor = page.getByTestId("transaction-editor");
  await editor.getByLabel("New Transaction name").fill("Picker test");
  await editor.getByLabel("New Transaction start").fill("1");
  await editor.getByLabel("New Transaction end").fill("3");
  await editor.getByRole("button", { name: "Create Transaction" }).click();

  const inspector = page.getByTestId("inspector");
  const linked = inspector.getByTestId("transaction-linked-signals");
  await expect(linked.locator("input[type='checkbox']")).toHaveCount(0);
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
  await linked.getByTestId("open-linked-signal-picker").click();
  const picker = linked.getByTestId("linked-signal-picker");
  await picker.getByLabel("Search linked signals").fill("DATA");
  const result = picker.getByRole("option", { name: /DATA/ });
  await expect(result).toHaveCount(1);
  const results = picker.getByTestId("linked-signal-results");
  await results.focus();
  await results.press("ArrowDown");
  await results.press("Home");
  await results.press("End");
  await expect(results).toHaveAttribute("aria-activedescendant", /linked-signal-option-/);
  await results.press("Enter");
  await expect(linked.getByTestId("linked-signal-list")).toContainText("DATA");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const unlink = linked.getByRole("button", { name: "Unlink DATA" });
  await expect(unlink).toHaveAttribute("data-icon-button", "close");
  await unlink.focus();
  await unlink.press("Enter");
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(linked.getByTestId("linked-signal-list")).toContainText("DATA");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
});
