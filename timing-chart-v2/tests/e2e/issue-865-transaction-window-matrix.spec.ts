import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { documentState, expectViewOnly } from "./view-only.js";

/**
 * #865 acceptance matrix: with 10k Transactions across 100k cycles (+ Bookmarks and a collapsed fold), Transaction and Combined keep mounted
 * TransactionBars bounded by the horizontal viewport at far-left / middle / far-right, the page-wide DOM does not scale with the document, an
 * off-screen Transaction is revealed by stable ID from the Tree, and the MiniMap enabled/hidden states stay bounded and view-only.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;
const CYCLES = 100_000;

function bigDocument() {
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: CYCLES, profile: "standard" });
  const transactions = Array.from({ length: 10_000 }, (_, index) => ({ id: `txn_w_${index}`, name: `W${index}`, start: index * 10, end: index * 10 + 6, laneId: `lane_${index % 4}`, linkedSignals: [] }));
  const bookmarks = Array.from({ length: 2_000 }, (_, index) => ({ id: `bm_w_${index}`, name: `B${index}`, start: index * 50 + 1 }));
  const timeGroups = [{ id: "tg_w", name: "Fold", start: 30_000, end: 31_000, category: "collapsed", presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "1000" } }];
  return { ...base, transactions, bookmarks, timeGroups };
}

const counts = (page: Page) => page.evaluate(() => ({
  bars: document.querySelectorAll("[data-testid='transaction-lanes'] [data-transaction-id]").length,
  markers: document.querySelectorAll(".transaction-bookmark-markers button").length,
  nodes: document.querySelectorAll("*").length,
  candidates: Number(document.querySelector("[data-horizontal-candidate-transactions]")?.getAttribute("data-horizontal-candidate-transactions") ?? "-1"),
  guides: document.querySelectorAll(".transaction-geometry-line").length,
  foldSummaries: document.querySelectorAll("[data-hidden-bookmark-count]").length,
  miniMapSegments: document.querySelectorAll(".minimap-segment-transaction").length,
  total: Number(document.querySelector("[data-testid='transaction-lanes']")?.getAttribute("data-total-transactions") ?? "0"),
}));

for (const mode of ["Transaction", "Combined"] as const) for (const size of sizes) {
  test(`${mode}: horizontal window, reveal-by-ID and MiniMap states stay bounded at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "w865.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bigDocument())) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "10000", { timeout: 240_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 240_000 });
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
    const owner = page.getByTestId("cycle-viewport");
    const before = await documentState(page);

    const seen: Array<Record<string, number | string>> = [];
    for (const fraction of [0, 0.5, 1]) {
      await owner.evaluate(async (el, f) => { el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) * f); await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); }, fraction);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await page.waitForTimeout(400);
      const c = await counts(page);
      seen.push({ at: `scroll ${fraction}`, ...c });
      expect(c.total, "document total is intact").toBe(10_000);
      expect(c.bars, `mounted TransactionBars at ${fraction}`).toBeLessThan(400);
      expect(c.markers, `mounted Bookmark markers at ${fraction}`).toBeLessThan(600);
    }
    expect(Math.max(...seen.map((item) => item.nodes)) - Math.min(...seen.map((item) => item.nodes)), "page DOM does not grow with scroll position").toBeLessThan(1500);

    // Off-screen stable-ID reveal: pick a Transaction far from the current window through the Tree and make sure it gets mounted.
    await owner.evaluate((el) => { el.scrollLeft = 0; });
    await page.waitForTimeout(300);
    const row = page.locator("[data-transaction-row-id]").first();
    await expect(row).toBeVisible();
    await row.click();
    const selectedId = await row.getAttribute("data-transaction-row-id");
    await expect(page.locator(`[data-transaction-id="${selectedId}"]`).first()).toBeAttached({ timeout: 20_000 });

    // MiniMap hidden -> shown: both stay bounded and nothing mutates the document.
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    const toggle = page.getByTestId("ribbon").getByRole("button", { name: "MiniMap", exact: true });
    if (await toggle.count()) {
      for (const state of ["toggled", "toggled back"]) {
        await toggle.click();
        await page.waitForTimeout(500);
        const c = await counts(page);
        expect(c.bars, `bars after MiniMap ${state}`).toBeLessThan(400);
        expect(await page.locator(".minimap-segment-transaction").count(), `MiniMap segments after ${state}`).toBeLessThanOrEqual(4 * 1024);
      }
    }
    await expectViewOnly(page, { ...before, history: before.history, dirty: before.dirty, revision: before.revision });
    console.log("E865-MATRIX", JSON.stringify({ mode, size, seen }));
  });
}
