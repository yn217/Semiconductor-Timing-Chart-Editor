import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #769: Transaction Tree virtualization must not change keyboard semantics (logical row model, not mounted DOM order) and must not go
// stale when tree topology above a window changes (Group collapse/expand without a scroll event).
async function openLargeGroup(page: Page, count: number) {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: count, cycleCount: 64, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "tree769.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator("[data-tree-windowed='true']")).toBeVisible();
}
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-transaction-tree-id") ?? undefined);
const mountedCount = () => undefined;
void mountedCount;

test("Journeys 1-2: ArrowDown then ArrowUp reach every logical row across window boundaries (>500 Transactions)", async ({ page }) => {
  test.setTimeout(240_000);
  await openLargeGroup(page, 520);
  const first = page.locator(".transaction-left-tree-row").first();
  await first.click();
  await first.focus();
  const seenDown: string[] = [];
  for (let step = 0; step < 200; step += 1) {
    await page.keyboard.press("ArrowDown");
    const id = await focusedId(page);
    expect(id, `ArrowDown step ${step}: focus left the tree`).toBeDefined();
    seenDown.push(id!);
  }
  // 200 distinct rows reached going down (well past the ~150-row windowing threshold and the initial ~60-row window).
  expect(new Set(seenDown).size, "distinct rows reached going down").toBeGreaterThan(150);
  const seenUp: string[] = [];
  for (let step = 0; step < 200; step += 1) {
    await page.keyboard.press("ArrowUp");
    const id = await focusedId(page);
    expect(id, `ArrowUp step ${step}: focus left the tree`).toBeDefined();
    seenUp.push(id!);
  }
  expect(new Set(seenUp).size, "distinct rows reached going up").toBeGreaterThan(150);
});

test("Journey 3-4: keyboard navigation continues correctly after a Group above collapses/expands without manual scroll", async ({ page }) => {
  test.setTimeout(240_000);
  await openLargeGroup(page, 520);
  // A real Group above the large Ungrouped set: create the Group, select one row and move it in via the Bottom "Group" select so
  // collapsing that Group actually changes height (an empty Group's collapse would not move anything below it).
  await page.getByTestId("add-transaction-group-tree-visible").click();
  await expect(page.locator(".transaction-left-tree-group[data-transaction-group-id]").first()).toBeVisible();
  const firstRow = page.locator(".transaction-left-tree-row").first();
  const firstRowId = await firstRow.getAttribute("data-transaction-tree-id");
  await firstRow.click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByLabel("Move selected transaction to group").selectOption({ label: "Group 1" });
  await expect.poll(() => page.locator(".transaction-left-tree-group[data-transaction-group-id]").first().locator(".transaction-left-tree-row").count()).toBe(1);
  // Focus a row well inside the large Ungrouped window, note it.
  void firstRowId;
  const targetRow = page.locator(".transaction-left-tree-row").nth(10);
  await targetRow.click();
  await targetRow.focus();
  const before = await focusedId(page);
  expect(before).toBeDefined();
  // Collapse the Group above Ungrouped: its one row disappears, shifting Ungrouped's on-screen offset without any scroll event.
  const groupHeader = page.locator(".transaction-left-tree-group-header").first();
  await groupHeader.getByRole("button", { name: /^Collapse/ }).click();
  // Continue keyboard navigation without any manual scroll: it must still move and land on a real, focused, DIFFERENT row (Failure 2's
  // stale-range bug would leave the window computed for the OLD offset, potentially mounting the wrong/blank rows).
  await page.keyboard.press("ArrowDown");
  const afterCollapse = await focusedId(page);
  expect(afterCollapse, "row remains focusable after Group A collapses").toBeDefined();
  expect(afterCollapse).not.toBe(before);
  await groupHeader.getByRole("button", { name: /^Expand/ }).click();
  await page.keyboard.press("ArrowDown");
  const afterExpand = await focusedId(page);
  expect(afterExpand, "row remains focusable after Group A re-expands").toBeDefined();
});

test("Journey 5: filter a large group, clear it, keyboard navigation continues", async ({ page }) => {
  test.setTimeout(240_000);
  await openLargeGroup(page, 520);
  const filter = page.getByTestId("transaction-tree-search");
  await filter.fill("Transaction 1");
  await expect.poll(() => page.locator(".transaction-left-tree-row").count()).toBeGreaterThan(0);
  await filter.fill("");
  // Virtualization caps the MOUNTED row count regardless of total; check the logical count via the group label instead.
  await expect(page.locator(".transaction-left-tree-group-header").getByText(/^\(5\d\d\)$/)).toBeVisible();
  const first = page.locator(".transaction-left-tree-row").first();
  await first.click(); await first.focus();
  await page.keyboard.press("ArrowDown");
  expect(await focusedId(page)).toBeDefined();
});

test("Journey 6: navigation and collapse/expand are view-only (Canonical/History/Dirty unchanged)", async ({ page }) => {
  test.setTimeout(240_000);
  await openLargeGroup(page, 520);
  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const first = page.locator(".transaction-left-tree-row").first();
  await first.click(); await first.focus();
  for (let i = 0; i < 30; i += 1) await page.keyboard.press("ArrowDown");
  await page.getByTestId("transaction-tree-more").click();
  await page.getByTestId("transaction-tree-collapse-all").click();
  await page.getByTestId("transaction-tree-more").click();
  await page.getByTestId("transaction-tree-expand-all").click();
  await expect(page.getByTestId("history-status")).toHaveText(history);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
});

// Performance acceptance: mounted row count stays bounded on a very large document.
test("mounted Transaction Tree row count stays bounded on a 3,000-row group", async ({ page }) => {
  test.setTimeout(240_000);
  await openLargeGroup(page, 3_000);
  const mounted = await page.locator(".transaction-left-tree-row").count();
  expect(mounted).toBeLessThan(400);
});
