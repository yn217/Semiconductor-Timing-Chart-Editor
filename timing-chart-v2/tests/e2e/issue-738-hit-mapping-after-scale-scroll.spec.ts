import { expect, test, type Page } from "@playwright/test";
import { setTimelineScrollLeft, timelineOwner, timelineScrollLeft } from "./timeline-scroll.js";

const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

async function open(page: Page, size: { width: number; height: number }, mode: "Transaction" | "Combined") {
  await page.setViewportSize(size);
  await page.goto("/?transaction-demo");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
}

async function setScale(page: Page, value: "10" | "5" | "__custom__") {
  const select = page.getByTestId("transaction-tc-scale");
  if (value === "__custom__") {
    await select.selectOption("__custom__");
    await page.getByLabel("Custom cycles per TC").fill("3");
    await page.getByTestId("apply-transaction-tc-scale-custom").click();
    await expect(select).toHaveValue("3");
  } else {
    await select.selectOption(value);
  }
}

async function assertVisibleRulerCellHit(page: Page, context: string) {
  const cell = await page.getByTestId("cycle-ruler").evaluate((ruler) => {
    const bounds = ruler.getBoundingClientRect();
    const allTicks = [...ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]")]
      .map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left }));
    const ticks = allTicks
      .filter((tick) => tick.x >= bounds.left && tick.x < bounds.right)
      .sort((a, b) => a.x - b.x);
    for (let i = 0; i < ticks.length - 1; i += 1) {
      const a = ticks[i]!;
      const b = ticks[i + 1]!;
      const sourceStep = b.cycle - a.cycle;
      if (sourceStep < 1 || (b.x - a.x) / sourceStep < 1 || b.x > bounds.right) continue;
      const source = a.cycle + Math.min(Math.floor(sourceStep / 2), sourceStep - 1);
      const cycleX0 = a.x + (source - a.cycle) / sourceStep * (b.x - a.x);
      const cyclePitch = (b.x - a.x) / sourceStep;
      return { source, x0: cycleX0, pitch: cyclePitch, top: bounds.top, bottom: bounds.bottom };
    }
    return { diagnostic: { bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }, ticks: allTicks.slice(0, 12), lastTicks: allTicks.slice(-12), visible: ticks } };
  });
  expect(cell && "source" in cell, `${context}: complete visible source-cycle interval exists in ruler; actual=${JSON.stringify(cell)}`).toBe(true);
  if (!cell || !("source" in cell)) return;

  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const dirty = await page.getByTestId("dirty-status").innerText();
  for (const [fraction, y] of [
    [0.2, cell!.top + 2], [0.5, cell!.top + 2], [0.8, cell!.top + 2],
    [0.2, cell!.bottom - 2], [0.8, cell!.bottom - 2],
  ] as const) {
    await page.mouse.click(cell!.x0 + cell!.pitch * fraction, y);
    await expect(page.getByLabel("Timeline range start")).toHaveValue(String(cell!.source));
    await expect(page.getByLabel("Timeline range end")).toHaveValue(String(cell!.source + 1));
  }
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
}

for (const size of sizes) {
  test(`TC-scale and zoom keep ruler hit mapping aligned through horizontal scroll at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, size, "Transaction");

    const bar = page.locator("[data-testid='transaction-lanes'] [data-transaction-id='demo_txn_read']");
    const phases = bar.locator("[data-phase-segment]");
    const assertBarAndPhasesAlignAtZero = async () => {
      const ruler = page.getByTestId("cycle-ruler");
      const tickX = async (cycle: number) => {
        const tick = ruler.locator(`.cycle-tick[data-source-cycle='${cycle}']`);
        await expect(tick).toHaveCount(1);
        return (await tick.boundingBox())!.x;
      };
      const zero = await tickX(0);
      const sixty = await tickX(60);
      const sourceTenX = zero + (10 / 60) * (sixty - zero);
      // Transaction projection intentionally overscans the visible source-time
      // window. A pixel-only viewport test cannot distinguish that bounded
      // source-cycle overscan from an incorrectly mounted far-offscreen bar.
      // If no bar is mounted, its start is outside the projected window; if it
      // is mounted within overscan, still verify its geometry against the ruler.
      const viewportRight = (await page.getByTestId("cycle-viewport").boundingBox())!.x + (await page.getByTestId("cycle-viewport").boundingBox())!.width;
      if (sourceTenX > viewportRight + 2 && await bar.count() === 0) return;
      const barBox = (await bar.boundingBox())!;
      expect(Math.abs(barBox.x - sourceTenX), "Transaction start at source cycle 10").toBeLessThan(2);
      expect(Math.abs(barBox.x + barBox.width - sixty), "Transaction end at source cycle 60").toBeLessThan(2);
      const expected = new Map([["Address", [10, 20]], ["Read Data", [20, 50]], ["Response", [50, 60]]]);
      await expect(phases).toHaveCount(3);
      for (const phase of await phases.all()) {
        const title = await phase.getAttribute("title");
        const match = /^(.*): (\d+)–(\d+)$/.exec(title ?? "");
        expect(match, `phase semantic bounds: ${title}`).not.toBeNull();
        const bounds = expected.get(match![1]!);
        expect(bounds).toEqual([Number(match![2]), Number(match![3])]);
        const box = (await phase.boundingBox())!;
        const expectedX0 = zero + (bounds![0]! / 60) * (sixty - zero);
        const expectedX1 = zero + (bounds![1]! / 60) * (sixty - zero);
        expect(Math.abs(box.x - expectedX0), `${match![1]} phase start`).toBeLessThan(2);
        expect(Math.abs(box.x + box.width - expectedX1), `${match![1]} phase end`).toBeLessThan(2);
      }
    };

    for (const scale of ["10", "5", "__custom__"] as const) {
      await setScale(page, scale);
      for (const zoom of ["50", "200", "800"] as const) {
        await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
        await page.getByLabel("Zoom preset").selectOption(zoom);
        await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

        await setTimelineScrollLeft(page, 0);
        await expect.poll(() => timelineScrollLeft(page)).toBe(0);
        const rulerZeroX = async () => (await page.getByTestId("cycle-ruler").locator(".cycle-tick[data-source-cycle='0']").boundingBox())!.x;
        const originAtZero = await rulerZeroX();
        await assertBarAndPhasesAlignAtZero();
        await assertVisibleRulerCellHit(page, `${size.width}x${size.height}, scale=${scale}, zoom=${zoom}, scroll=0`);

        const extent = await page.getByTestId("cycle-viewport").evaluate((element) => element.scrollWidth - element.clientWidth);
        if (extent > 20) {
          for (const target of [extent * 0.25, extent * 0.5, 0] as const) {
            await setTimelineScrollLeft(page, target);
            await expect.poll(async () => {
              const left = await timelineScrollLeft(page);
              const rulerLeft = await rulerZeroX();
              return Math.abs(rulerLeft - (originAtZero - left));
            }, { timeout: 10_000, message: `ruler origin follows scroll at ${target}px` }).toBeLessThan(2);
            if (target > 0) expect(await timelineScrollLeft(page)).toBeGreaterThan(0);
            else await expect.poll(() => timelineScrollLeft(page)).toBe(0);
            await assertVisibleRulerCellHit(page, `${size.width}x${size.height}, scale=${scale}, zoom=${zoom}, scroll=${target}`);
          }
        }
      }
    }

    // The shared ruler is also used by Combined. Keep the TC scale active while switching modes,
    // then verify the same X->source-cycle interaction after a real horizontal offset.
    await setScale(page, "5");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption("200");
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    const extent = await timelineOwner(page).evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(extent).toBeGreaterThan(20);
    await setTimelineScrollLeft(page, 0);
    await expect.poll(() => timelineScrollLeft(page)).toBe(0);
    const rulerZeroX = async () => (await page.getByTestId("cycle-ruler").locator(".cycle-tick[data-source-cycle='0']").boundingBox())!.x;
    const originAtZero = await rulerZeroX();
    await setTimelineScrollLeft(page, extent * 0.35);
    await expect.poll(async () => {
      const left = await timelineScrollLeft(page);
      const rulerLeft = await rulerZeroX();
      return Math.abs(rulerLeft - (originAtZero - left));
    }, { timeout: 10_000, message: `Combined ruler origin follows horizontal scroll at ${size.width}x${size.height}` }).toBeLessThan(2);
    await assertVisibleRulerCellHit(page, `Combined ${size.width}x${size.height}, scale=5, zoom=200%, scrolled`);
  });
}
