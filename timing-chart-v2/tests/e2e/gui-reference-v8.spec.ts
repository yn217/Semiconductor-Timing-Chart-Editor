import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("matches the v8 shell contract without mutating canonical state", async ({ page }) => {
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const before = await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters");
  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const rowY = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => Math.round(element.getBoundingClientRect().y));
    const ribbon = document.querySelector<HTMLElement>("[data-testid='ribbon']")!;
    return {
      title: rect(".app-titlebar"), tabs: rect(".ribbon-tabs"), ribbon: rect("[data-testid='ribbon']"),
      workspace: rect(".desktop-workspace"), bottom: rect("[data-testid='bottom-editor']"), inspector: rect(".inspector-shell"), status: rect(".status-bar"),
      leftWidth: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(".editor-shell")!).getPropertyValue("--gui-left-width")),
      frozenWidth: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(".editor-shell")!).getPropertyValue("--gui-frozen-width")),
      ribbonOverflow: { clientWidth: ribbon.clientWidth, scrollWidth: ribbon.scrollWidth },
      rowY: { left: rowY("[data-role='left-row'][data-row-id]"), frozen: rowY("[data-role='frozen-row'][data-row-id]"), wave: rowY("[data-role='wave-owner'][data-signal-id]") },
      display: { grid: rect("[data-testid='home-grid-toggle']"), snap: rect("[data-testid='home-snap-toggle']") },
    };
  });
  expect(metrics.title).toMatchObject({ height: 31 });
  expect(metrics.tabs).toMatchObject({ y: 31, height: 34 });
  expect(metrics.ribbon).toMatchObject({ y: 65, height: 102 });
  expect(metrics.leftWidth).toBe(265);
  expect(metrics.frozenWidth).toBe(209);
  expect(metrics.inspector.width).toBe(297);
  expect(metrics.bottom.height).toBe(240);
  expect(metrics.status.height).toBe(25);
  expect(metrics.ribbonOverflow.scrollWidth).toBeLessThanOrEqual(metrics.ribbonOverflow.clientWidth + 1);
  expect(metrics.rowY.left.length).toBeGreaterThan(0);
  expect(Math.max(...metrics.rowY.left.map((y, index) => Math.abs(y - (metrics.rowY.frozen[index] ?? y))))).toBeLessThanOrEqual(1);
  const signalWaveRows = await page.locator("[data-role='wave-owner'][data-signal-id]").evaluateAll((owners) => owners.map((owner) => {
    const id = (owner as HTMLElement).dataset.signalId;
    const frozen = document.querySelector<HTMLElement>(`[data-role='frozen-row'][data-row-id='${id}']`);
    return { frozenY: frozen?.getBoundingClientRect().y ?? 0, waveY: (owner as HTMLElement).getBoundingClientRect().y };
  }));
  expect(Math.max(...signalWaveRows.map(({ frozenY, waveY }) => Math.abs(frozenY - waveY)))).toBeLessThanOrEqual(1);
  expect(await page.locator("[data-role='tree-signal-role'] .comment-icon, [data-role='signal-role'] .comment-icon").count()).toBeGreaterThan(0);
  expect(await page.locator("[data-role='tree-visibility'] svg, [data-role='tree-more'] svg, [data-role='tree-collapse'] svg").count()).toBeGreaterThan(0);
  expect(await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(before);
  await page.screenshot({ path: "artifacts/gui-v8/reference-contract-dut.png", animations: "disabled" });
});
