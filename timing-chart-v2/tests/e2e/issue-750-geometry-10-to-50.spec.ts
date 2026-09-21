import { expect, test, type Page } from "@playwright/test";

// #750 contract: cyclesPerTC is a horizontal display-time COMPRESSION factor (standalone Transaction). Going 1 TC = 10 cycles -> 50 cycles makes
// the same source span 5x physically shorter (Transaction bars 5x narrower), one TC keeps the same pixel pitch on the ruler, and the
// canonical source cycles never change.
const rulerLabelXs = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick")]
  .filter((tick) => (tick.textContent ?? "").trim() !== "").slice(0, 4).map((tick) => ({ label: (tick.textContent ?? "").trim(), source: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().x })));
const barBox = (page: Page) => page.evaluate(() => { const bar = document.querySelector<HTMLElement>("[data-transaction-id='demo_txn_read']")!; const b = bar.getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, width: Math.round(b.width * 10) / 10 }; });

for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`1 TC = 10 cycles -> 50 cycles compresses bars 5x, keeps TC label pitch, never changes canonical cycles (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const select = page.getByTestId("transaction-tc-scale");
    await expect(select).toHaveValue("10");
    await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
    const inspector = page.getByTestId("inspector");
    const duration = inspector.locator(".property-row", { hasText: "Duration" });
    await expect(duration).toContainText("cycles");
    const cyclesOf = async () => Number(/\((\d+) cycles\)/.exec((await duration.innerText()) ?? "")?.[1]);
    const canonicalStart = async () => Number(await inspector.getByLabel("Transaction start").inputValue());

    const labelsBefore = await rulerLabelXs(page);
    const barBefore = await barBox(page);
    const durationBefore = await cyclesOf();
    const startTcBefore = await canonicalStart();
    expect(labelsBefore.map((l) => l.source)).toEqual([0, 10, 20, 30]);
    const spacingBefore = labelsBefore[1]!.x - labelsBefore[0]!.x;
    const barWidthBefore = barBefore.width;

    await select.selectOption("50");
    await expect.poll(async () => (await rulerLabelXs(page)).map((l) => l.source)).toEqual([0, 50, 100, 150]);
    const labelsAfter = await rulerLabelXs(page);
    const spacingAfter = labelsAfter[1]!.x - labelsAfter[0]!.x;
    // One TC keeps its pixel pitch (1 TC = the width 1 cycle had at 1:1); the same source span is 5x shorter.
    expect(spacingAfter / spacingBefore).toBeGreaterThan(0.95);
    expect(spacingAfter / spacingBefore).toBeLessThan(1.05);
    expect(labelsAfter.map((l) => l.label)).toEqual(["0", "1", "2", "3"]);
    const barAfter = await barBox(page);
    expect(barWidthBefore / barAfter.width).toBeGreaterThan(4.6);
    expect(barWidthBefore / barAfter.width).toBeLessThan(5.4);
    // Canonical source cycles did not move.
    expect(await cyclesOf()).toBe(durationBefore);
    // Displayed Start is the same canonical cycle re-expressed in the new unit.
    expect(await canonicalStart()).toBeCloseTo(startTcBefore * 10 / 50, 3);
    // Undo restores the presentation exactly (bar width included).
    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(select).toHaveValue("10");
    await expect.poll(async () => (await rulerLabelXs(page)).map((l) => l.source)).toEqual([0, 10, 20, 30]);
    expect(await canonicalStart()).toBeCloseTo(startTcBefore, 3);
    await expect.poll(async () => (await barBox(page)).width).toBeCloseTo(barWidthBefore, 0);
  });
}

// #750 presentation contract around the compressed geometry: narrow bars never show clipped text (full name stays in aria-label/title),
// and the scroll extent is the presented content -- a document narrower than the viewport gets NO artificial horizontal scrolling and
// no stretched TC geometry (blank space to the right is valid).
for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`compressed Transaction: no clipped labels and no artificial scroll extent at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.getByTestId("transaction-tc-scale").selectOption("50");
    await expect.poll(async () => (await barBox(page)).width).toBeLessThan(60);
    const info = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
      const bars = [...document.querySelectorAll<HTMLElement>("[data-testid='transaction-lanes'] [data-transaction-id]")];
      return {
        clientWidth: viewport.clientWidth, scrollWidth: viewport.scrollWidth,
        clipped: bars.filter((bar) => { const label = bar.querySelector<HTMLElement>(":scope > span"); return !!label && label.textContent !== "" && label.scrollWidth > bar.clientWidth + 1; }).map((bar) => bar.dataset.transactionId),
        narrowWithoutName: bars.filter((bar) => bar.getBoundingClientRect().width < 56 && (!bar.getAttribute("aria-label") || bar.querySelector(":scope > span")?.textContent !== "")).map((bar) => bar.dataset.transactionId),
      };
    });
    expect(info.clipped).toEqual([]);
    expect(info.narrowWithoutName).toEqual([]);
    // Presented content (~3 TC) is far narrower than the viewport: no artificial horizontal scrolling (<=1px rounding).
    expect(info.scrollWidth - info.clientWidth).toBeLessThanOrEqual(2);
  });
}
