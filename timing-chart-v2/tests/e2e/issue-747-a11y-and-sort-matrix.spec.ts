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
    const column = (index: number) => editor.locator(".transaction-list-row > button").evaluateAll((rows, i) => rows.map((row) => Number(row.querySelectorAll("span")[i]?.textContent)), index);
    await page.getByTestId("transaction-left-tree-row-demo_txn_write").click();
    const selectedBefore = await editor.locator(".transaction-list-row > button[data-selected='true']").count();
    const direction = page.getByTestId("transaction-sort-direction");
    await expect(direction).toBeDisabled();
    for (const [key, index] of [["start", 2], ["end", 3]] as const) {
      await editor.getByTestId("transaction-sort-key").selectOption(key);
      const label = key === "start" ? "Start" : "End";
      await expect(direction).toHaveAttribute("aria-label", `Sort by ${label} ascending`);
      await expect(direction).toHaveAttribute("aria-pressed", "false");
      const asc = await column(index);
      expect([...asc].sort((a, b) => a - b), `${key} asc`).toEqual(asc);
      await direction.click();
      await expect(direction).toHaveAttribute("aria-label", `Sort by ${label} descending`);
      await expect(direction).toHaveAttribute("aria-pressed", "true");
      const desc = await column(index);
      expect([...desc].sort((a, b) => b - a), `${key} desc`).toEqual(desc);
      await direction.click();
    }
    // Only one primary key is active at a time (single select), sorting is view-only and keeps the selection.
    expect(await editor.getByTestId("transaction-sort-key").evaluate((el) => (el as HTMLSelectElement).selectedOptions.length)).toBe(1);
    expect(await editor.locator(".transaction-list-row > button[data-selected='true']").count()).toBe(selectedBefore);
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
