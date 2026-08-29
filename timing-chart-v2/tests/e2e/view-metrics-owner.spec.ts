import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

async function readCounters(page: Page): Promise<Record<string, unknown>> {
  return JSON.parse((await page.getByTestId("cycle-surface").getAttribute("data-session-counters")) ?? "{}");
}

async function assertRulerGridAligned(page: Page, cycles: readonly number[]): Promise<void> {
  const samples = await page.evaluate((requested) => {
    const ticks = [...document.querySelectorAll<HTMLElement>(".cycle-ruler .cycle-tick")];
    const grid = [...document.querySelectorAll<HTMLElement>("[data-role='geometry-grid-line']")];
    const left = (element: Element | undefined): number | undefined => element?.getBoundingClientRect().left;
    return requested.map((cycle) => {
      const ruler = left(ticks.find((item) => item.dataset.cycle === String(cycle)));
      const line = left(grid.find((item) => item.dataset.cycle === String(cycle)));
      return { cycle, ruler, grid: line, rulerGridDelta: ruler === undefined || line === undefined ? undefined : Math.abs(ruler - line) };
    });
  }, cycles);
  for (const sample of samples) {
    expect(sample.ruler, `missing Ruler boundary for cycle ${sample.cycle}`).toBeDefined();
    expect(sample.grid, `missing Grid boundary for cycle ${sample.cycle}`).toBeDefined();
    expect(sample.rulerGridDelta, `Ruler/Grid drift at cycle ${sample.cycle}`).toBeLessThanOrEqual(1);
  }
}

async function resize(page: Page, testId: string, deltaX: number): Promise<void> {
  const handle = page.getByTestId(testId);
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + deltaX, box!.y + box!.height / 2);
  await page.mouse.up();
}

test("long-lived ruler/grid callbacks read current pane metrics after resize", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const shell = page.locator(".editor-shell");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await readCounters(page),
  };

  await resize(page, "left-pane-resizer", 40);
  await resize(page, "frozen-pane-resizer", 30);
  await resize(page, "inspector-resizer", -50);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(host).toHaveAttribute("data-history-depth", before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  const afterResize = await readCounters(page);
  expect(afterResize.waveDromRenders).toBe(before.counters.waveDromRenders);
  expect(afterResize.localGeometryBuilds).toBe(before.counters.localGeometryBuilds);

  const beforeRulerBuilds = Number(before.counters.rulerBuilds ?? 0);
  await page.locator(".home-timeline-group").getByRole("button", { name: "Insert one cycle", exact: true }).click();
  await expect.poll(async () => Number((await readCounters(page)).rulerBuilds ?? 0)).toBeGreaterThan(beforeRulerBuilds);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const metrics = JSON.parse((await host.getAttribute("data-view-metrics")) ?? "{}");
  expect(metrics.leftPaneWidth).toBe(Number(await shell.getAttribute("data-left-pane-width")));
  expect(metrics.frozenPaneWidth).toBe(Number(await shell.getAttribute("data-frozen-pane-width")));
  expect(metrics.inspectorWidth).toBe(Number(await shell.getAttribute("data-inspector-width")));
  await assertRulerGridAligned(page, [0, 12, 25]);
});
