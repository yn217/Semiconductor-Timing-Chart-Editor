import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { expect, test } from "@playwright/test";

test("Signal Tree filters offscreen canonical Signals, compacts matches, and restores scroll without document mutation", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-viewport")).toBeVisible();

  const document = generatePerformanceDocument({ signalCount: 1_000, cycleCount: 100 });
  const target = document.signals.find((signal) => signal.id === "sig_perf_999")!;
  const group = document.signalGroups.find((item) => item.rows.includes(target.id))!;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "issue-1055-signal-tree-filter.tcd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  const discard = page.getByTestId("unsaved-discard");
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  const treeViewport = page.getByTestId("cycle-viewport");
  await treeViewport.evaluate((element) => { (element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight; });
  await expect.poll(() => treeViewport.evaluate((element) => (element as HTMLElement).scrollTop)).toBeGreaterThan(0);
  const preFilterScrollTop = await treeViewport.evaluate((element) => (element as HTMLElement).scrollTop);
  const preFilterMountedRowCount = await host.locator("[data-role='left-row']").count();
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  const search = page.getByTestId("signal-tree-search-top");
  await search.fill(target.display.name);
  const targetRow = host.locator(`[data-role='left-row'][data-row-id='${target.id}']`);
  await expect(targetRow).toBeVisible();
  await expect(host.locator("[data-role='left-row']:not([hidden])")).toHaveCount(1);
  await expect(host.locator("[data-role='left-group-header']:not([hidden])")).toHaveCount(1);
  await expect(host).toHaveAttribute("data-tree-filter-matches", "1");
  await expect(host.locator("[data-role='left-group-header']:not([hidden])")).toHaveAttribute("data-group-id", group.id);
  await expect.poll(() => treeViewport.evaluate((element) => (element as HTMLElement).scrollTop)).toBe(0);

  await page.getByRole("button", { name: "Clear signal tree filter" }).click();
  await expect(search).toHaveValue("");
  await expect(host.locator("[data-role='left-row']")).toHaveCount(preFilterMountedRowCount);
  await expect.poll(() => treeViewport.evaluate((element) => (element as HTMLElement).scrollTop)).toBe(preFilterScrollTop);
  expect({
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  }).toEqual(before);
});
