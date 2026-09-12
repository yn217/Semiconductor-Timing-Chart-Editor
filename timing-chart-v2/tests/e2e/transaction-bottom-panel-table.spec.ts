import { expect, test } from "@playwright/test";

// #397 Transaction Mode GUI Closure Section 6: the Bottom Transaction
// Panel's list was a wrapping card grid (`repeat(auto-fill,minmax(340px,1fr))`)
// with per-row `auto`-sized trailing columns -- rows with different text
// lengths (e.g. an ungrouped row skipping the Group column entirely)
// drifted out of alignment with each other, and there was no column
// header at all. This makes the list read as one full-width, aligned
// table: a header row repeats the exact fixed-width grid every row's
// button uses, and every row always renders all 8 data columns (an em
// dash placeholder when a column doesn't apply) so nothing shifts.
// Description (Transaction Mode GUI realignment) is the newest column,
// appended after the original 7 rather than interspersed.

const columnXs = async (locator: import("@playwright/test").Locator) => (await locator.evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().x))));

for (const [width, height] of [[1672, 941], [1280, 720]] as const) {
  test(`Transaction list reads as one aligned table at ${width}x${height}: header lines up with every row's columns, Group column always present`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.getByRole("tab", { name: "Transaction", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();

    await page.getByTestId("add-transaction-group-tree").click();
    const create = page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true });
    await create.click();
    await create.click();

    const editor = page.getByTestId("transaction-editor");
    const groupSelect = editor.getByLabel("Move selected transaction to group");
    await groupSelect.selectOption({ label: "Group 1" });
    await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");

    const list = editor.locator(".transaction-list");
    const header = list.locator(".transaction-list-header");
    await expect(header).toBeVisible();
    await expect(header).toHaveText("NameGroupLaneStart CycleEnd CycleDuration (cycles)# PhasesLinked SignalsColorDescription");

    const rows = list.locator(".transaction-list-row");
    await expect(rows).toHaveCount(2);
    // The just-created, still-ungrouped row shows an em dash in the Group
    // column instead of skipping it -- keeps every row on the same fixed
    // 8-column grid as the header.
    await expect(rows.nth(0).locator("button")).toContainText("Ungrouped");
    await expect(rows.nth(1).locator("button")).toContainText("Group 1");

    // Column boundaries: the header's cells and every row's cells land on
    // the same x coordinate (within a rounding pixel), proving real table
    // alignment rather than each row independently auto-sizing its own
    // columns.
    const headerXs = await columnXs(header.locator(".transaction-list-header-cells > span"));
    const row0Xs = await columnXs(rows.nth(0).locator("button > *"));
    const row1Xs = await columnXs(rows.nth(1).locator("button > *"));
    for (let index = 0; index < headerXs.length; index += 1) {
      expect(Math.abs(headerXs[index]! - row0Xs[index]!)).toBeLessThanOrEqual(1);
      expect(Math.abs(row0Xs[index]! - row1Xs[index]!)).toBeLessThanOrEqual(1);
    }
  });
}
