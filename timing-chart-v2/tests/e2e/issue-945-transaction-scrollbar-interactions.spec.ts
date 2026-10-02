import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #945 closure matrix (native scrollbars kept on): after the #950 fix, the standalone Transaction scroll owner keeps stable geometry
 * (no clientWidth/clientHeight/scrollWidth/scrollHeight oscillation while idle) through a REAL horizontal scrollbar thumb drag, a far-right
 * jump, Zoom, and Transaction -> Cycle -> Transaction / Transaction -> Combined -> Transaction round trips, at both required viewports,
 * on a wide (overflowing) document and on a small-fit / tall-content document (#765 contract).
 */
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const sample = (page: Page, duration = 600) => page.evaluate((ms) => new Promise<{ changes: number; states: string[] }>((resolve) => {
  const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
  const states = new Set<string>(); let previous = ""; let changes = 0; const start = performance.now();
  const tick = () => {
    const key = `cw${viewport.clientWidth}/ch${viewport.clientHeight}/sw${viewport.scrollWidth}/sh${viewport.scrollHeight}`;
    if (key !== previous) { changes += 1; previous = key; states.add(key); }
    if (performance.now() - start < ms) requestAnimationFrame(tick); else resolve({ changes, states: [...states].slice(0, 4) });
  };
  requestAnimationFrame(tick);
}), duration);

async function expectStable(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(350);
  const result = await sample(page);
  expect(result.changes, `${label}: scroll-owner geometry kept changing while idle: ${result.states.join(" | ")}`).toBeLessThanOrEqual(1);
}

const documentFor = (kind: "wide" | "small-tall") => {
  const base = generatePerformanceDocument({ signalCount: kind === "wide" ? 4 : 4, cycleCount: kind === "wide" ? 20_000 : 24, profile: "standard" });
  const count = kind === "wide" ? 12 : 60;
  const spacing = kind === "wide" ? 1_500 : 0;
  return {
    ...base,
    transactions: Array.from({ length: count }, (_, index) => ({ id: `tx_${index}`, name: `tx_${index}`, start: kind === "wide" ? index * spacing : 2, end: (kind === "wide" ? index * spacing : 2) + 6, laneId: `lane_${kind === "wide" ? index % 3 : index}`, linkedSignals: [] })),
  };
};

for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  for (const kind of ["wide", "small-tall"] as const) {
    test(`Transaction scrollbars stay stable through thumb drag, far jump, Zoom and mode round trips (${kind}) at ${size.width}x${size.height}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
      await page.setViewportSize(size);
      await page.goto("/");
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `p945-${kind}.tcd`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(documentFor(kind))) });
      const lanes = page.getByTestId("transaction-lanes");
      await expect(lanes.locator("[data-transaction-id='tx_0']")).toHaveCount(1, { timeout: 60_000 });
      await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
      await expectStable(page, "after Open");

      if (kind === "wide") {
        const geometry = await page.evaluate(() => { const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!; const box = viewport.getBoundingClientRect(); return { left: box.left, bottom: box.top + viewport.offsetHeight, width: viewport.clientWidth, scrollWidth: viewport.scrollWidth, hasBar: viewport.offsetHeight > viewport.clientHeight }; });
        expect(geometry.scrollWidth).toBeGreaterThan(geometry.width);
        expect(geometry.hasBar, "native horizontal scrollbar present").toBe(true);
        const thumb = Math.max(20, geometry.width * geometry.width / geometry.scrollWidth);
        const y = geometry.bottom - 7;
        const startX = geometry.left + 17 + thumb / 2;
        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(startX + geometry.width * 0.35, y, { steps: 14 });
        await page.mouse.up();
        await expect.poll(() => page.getByTestId("cycle-viewport").evaluate((element) => element.scrollLeft), { timeout: 10_000 }).toBeGreaterThan(geometry.scrollWidth * 0.05);
        await expectStable(page, "after real thumb drag");
        await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await expect.poll(() => page.getByTestId("cycle-viewport").evaluate((element) => element.scrollWidth - element.clientWidth - element.scrollLeft), { timeout: 10_000 }).toBeLessThanOrEqual(2);
        await expectStable(page, "at far right");
      }

      await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
      await expectStable(page, "after Zoom In");
      await page.getByTestId("ribbon").getByRole("button", { name: "Zoom Out", exact: true }).click();
      await expectStable(page, "after Zoom Out");

      for (const other of ["Cycle", "Combined"] as const) {
        await page.locator(".view-mode").getByRole("button", { name: other, exact: true }).click();
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
        await expectStable(page, `in ${other}`);
        await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
        await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
        await expectStable(page, `back in Transaction after ${other}`);
      }
      if (kind === "small-tall") {
        // #765: a document that fits horizontally must not grow a horizontal scrollbar, while tall content scrolls vertically only.
        const overflow = await page.getByTestId("cycle-viewport").evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }));
        expect(overflow.x).toBeLessThanOrEqual(1);
      }
    });
  }
}
