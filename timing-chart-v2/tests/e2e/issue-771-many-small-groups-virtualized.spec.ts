import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #771: virtualization must be bounded by the TOTAL Transaction count across every Group, not each Group's own count -- 10,000
// Transactions spread across 100 Groups of 100 (each well under the old per-Group threshold) must still window.
test("10,000 Transactions across 100 small Groups still keeps mounted rows bounded", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 12, cycleCount: 64, profile: "transaction-heavy" });
  const transactionGroups = Array.from({ length: 100 }, (_, index) => ({ id: `grp_${index}` as never, name: `Group ${index}`, order: index }));
  const transactions = Array.from({ length: 10_000 }, (_, index) => ({
    id: `txn_small_${index}` as never, name: `Transaction ${index}`, start: (index * 3) % 60, end: ((index * 3) % 60) + 4,
    groupId: transactionGroups[Math.floor(index / 100)]!.id,
  }));
  const document = { ...base, transactionGroups, transactions };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "many-small-groups.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree")).toBeVisible();
  const mountedRows = await page.locator(".transaction-left-tree-row").count();
  expect(mountedRows, "mounted Transaction rows must stay viewport-bounded, not scale with 10,000 rows across 100 small Groups").toBeLessThan(400);
  // At least one Group is actually windowed (proof the global threshold engaged, not just an empty tree).
  await expect(page.locator("[data-tree-windowed='true']").first()).toBeVisible();
  // Secondary bound: 100 Group headers are cheap (~10 nodes each) and always mount; the DOM must not additionally scale with the
  // 10,000 Transaction total the way it would if every row were also mounted (that would be well over 100,000 nodes).
  const totalDomNodes = await page.evaluate(() => document.querySelectorAll("*").length);
  expect(totalDomNodes).toBeLessThan(25_000);

  // Scrolling must use the single tree viewport snapshot, not measure every group's window wrapper independently.
  await page.evaluate(() => {
    const reads = { group: 0, window: 0, groupsRoot: 0, header: 0 };
    Object.defineProperty(window, "__issue771GeometryReads", { configurable: true, value: reads });
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.matches(".transaction-left-tree-group")) reads.group += 1;
      if (this.matches("[data-tree-windowed='true']")) reads.window += 1;
      if (this.matches(".transaction-left-tree-groups")) reads.groupsRoot += 1;
      if (this.matches(".transaction-left-tree-group-header")) reads.header += 1;
      return original.call(this);
    };
  });
  const scrollEvidence = await page.evaluate(async () => {
    const tree = document.querySelector<HTMLElement>(".transaction-left-tree")!;
    tree.scrollTop = 900;
    tree.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { scrollTop: tree.scrollTop, reads: (window as typeof window & { __issue771GeometryReads: { group: number; window: number; groupsRoot: number; header: number } }).__issue771GeometryReads };
  });
  expect(scrollEvidence.scrollTop).toBeGreaterThan(0);
  expect(scrollEvidence.reads.group, "scroll must not read geometry once per Group").toBe(0);
  expect(scrollEvidence.reads.window, "scroll must not read geometry from each virtual row wrapper").toBe(0);
  expect(scrollEvidence.reads.groupsRoot).toBeLessThanOrEqual(1);
  expect(scrollEvidence.reads.header).toBeLessThanOrEqual(1);
});
