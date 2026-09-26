import { expect, test } from "@playwright/test";
import { openBottomSettings } from "./bottom-settings.js";

// #747 geometry acceptance: settings popover / selection / sorting never move the table header; Phase child cells align with header columns (<=1px);
// sorting (Start and End) is view-only and keeps Phase rows directly under their parent.
const viewports = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }];

test("Bottom table geometry is stable under settings, selection, sort and Phase expansion at both viewports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize(viewports[0]!);
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const editor = page.getByTestId("bottom-editor");

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const headerY = () => editor.locator(".transaction-list-header").first().evaluate((element) => element.getBoundingClientRect().y);
    const y0 = await headerY();
    await openBottomSettings(page);
    expect(Math.abs((await headerY()) - y0)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    expect(Math.abs((await headerY()) - y0)).toBeLessThanOrEqual(1);
    const history = await page.getByTestId("history-status").innerText();
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    // Expand the first Transaction that has Phases.
    const disclosure = editor.locator(".transaction-disclosure-slot").first();
    await expect(disclosure).toBeVisible();
    const phaseRows = editor.locator("[data-transaction-phase-row-id]");
    if (await phaseRows.count() === 0) await disclosure.click();
    await expect(phaseRows.first()).toBeVisible();
    const alignment = await editor.evaluate((root) => {
      const headerCells = Array.from(root.querySelectorAll<HTMLElement>(".transaction-list-header-cells > span")).map((cell) => cell.getBoundingClientRect().x);
      const phaseCells = Array.from(root.querySelector("[data-transaction-phase-row-id] .transaction-phase-cells")!.children).map((cell) => cell.getBoundingClientRect().x);
      const parentCells = Array.from(root.querySelector(".transaction-list-row > button")!.children).filter((cell) => cell.tagName !== "I").map((cell) => cell.getBoundingClientRect().x);
      return { headerCells, phaseCells, parentCells };
    });
    const shared = Math.min(alignment.headerCells.length, alignment.phaseCells.length);
    expect(shared).toBeGreaterThan(3);
    // Every Phase cell shares an X with some header column (drift <= 1px), i.e. no phase-specific offsets.
    for (const x of alignment.phaseCells.slice(0, shared)) expect(Math.min(...alignment.headerCells.map((h) => Math.abs(h - x)))).toBeLessThanOrEqual(1);
    const firstRow = editor.locator(".transaction-list-row > button").nth(1);
    await firstRow.click();
    expect(Math.abs((await headerY()) - y0)).toBeLessThanOrEqual(1);
    for (const key of ["start", "end"] as const) {
      await editor.getByTestId("transaction-sort-key").selectOption(key);
      await editor.getByTestId("transaction-sort-direction").click();
      const order = await editor.locator(".transaction-list-row, [data-transaction-phase-row-id]").evaluateAll((rows) => rows.map((row) => ({ phase: row.hasAttribute("data-transaction-phase-row-id"), id: row.getAttribute("data-transaction-id") ?? row.getAttribute("data-transaction-row-id") ?? row.querySelector("[data-transaction-row-id]")?.getAttribute("data-transaction-row-id") ?? null })));
      // Each Phase row is directly preceded by its parent row or a sibling Phase of the same parent.
      order.forEach((row, index) => { if (row.phase) expect(order[index - 1]!.id).toBe(row.id); });
      expect(Math.abs((await headerY()) - y0)).toBeLessThanOrEqual(1);
    }
    await expect(page.getByTestId("history-status")).toHaveText(history);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
    expect(errors).toEqual([]);
  }
});
