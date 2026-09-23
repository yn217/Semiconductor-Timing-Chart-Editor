import { expect, test } from "@playwright/test";
import { openBottomSettings } from "./bottom-settings.js";

// #747 accessibility + sort matrix: Start/End ascending/descending are announced by name and state, only one primary key is active, sorting is
// view-only and keeps the selected ID; the gear is named 'Bottom Panel settings' and Escape closes its popover.
// Sort and accessibility semantics are width-independent; retain the compact
// viewport. The separate geometry acceptance keeps the 1280/1672 layout matrix.
for (const viewport of [{ width: 1280, height: 720 }]) {
  test(`Bottom sort matrix and settings a11y at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
    const editor = page.getByTestId("bottom-editor");
    const history = await page.getByTestId("history-status").innerText();
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const order = () => editor.locator(".transaction-list-row[data-transaction-row-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-transaction-row-id")));
    const originalOrder = await order();
    await page.getByTestId("transaction-left-tree-row-demo_txn_write").click();
    const selectedBefore = await editor.locator(".transaction-list-row button[data-selected='true']").evaluate((button) => button.closest<HTMLElement>("[data-transaction-row-id]")?.dataset.transactionRowId);
    const direction = page.getByTestId("transaction-sort-direction");
    await expect(direction).toBeDisabled();
    const sortedIds = {
      start: ["demo_txn_read", "demo_txn_fetch", "demo_txn_spi", "demo_txn_execute", "demo_txn_write", "demo_txn_other"],
      end: ["demo_txn_fetch", "demo_txn_read", "demo_txn_spi", "demo_txn_execute", "demo_txn_write", "demo_txn_other"],
    } as const;
    for (const key of ["start", "end"] as const) {
      await editor.getByTestId("transaction-sort-key").selectOption(key);
      const label = key === "start" ? "Start" : "End";
      await expect(direction).toHaveAttribute("aria-label", `Sort by ${label} ascending`);
      await expect(direction).toHaveAttribute("aria-pressed", "false");
      const asc = sortedIds[key];
      expect(await order(), `${key} ascending order`).toEqual(asc);
      await direction.click();
      await expect(direction).toHaveAttribute("aria-label", `Sort by ${label} descending`);
      await expect(direction).toHaveAttribute("aria-pressed", "true");
      expect(await order(), `${key} descending order`).toEqual([...asc].reverse());
      await direction.click();
    }
    // Only one primary key is active at a time (single select), sorting is view-only and keeps the selected stable ID.
    expect(await editor.getByTestId("transaction-sort-key").evaluate((el) => (el as HTMLSelectElement).selectedOptions.length)).toBe(1);
    expect(await editor.locator(".transaction-list-row button[data-selected='true']").evaluate((button) => button.closest<HTMLElement>("[data-transaction-row-id]")?.dataset.transactionRowId)).toBe(selectedBefore);
    await editor.getByTestId("transaction-sort-key").selectOption("document");
    expect(await order(), "document sort restores the exact source row order").toEqual(originalOrder);
    await expect(page.getByTestId("history-status")).toHaveText(history);
    expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
    // Gear a11y.
    const gear = page.getByRole("button", { name: "Bottom Panel settings", exact: true });
    await expect(gear).toBeVisible();
    await openBottomSettings(page);
    await expect(gear).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(gear).toHaveAttribute("aria-expanded", "false");
    expect(errors).toEqual([]);
  });
}
