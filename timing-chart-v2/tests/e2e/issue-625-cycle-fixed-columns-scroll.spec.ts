import { expect, test } from "@playwright/test";

for (const viewportSize of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Cycle fixed columns stay stationary through native scrollbar drag at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize(viewportSize);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

    const viewport = page.getByTestId("cycle-viewport");
    const frozenClock = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']");
    const leftHeader = page.locator(".column-headings > .left-column-heading");
    const roleHeader = page.locator(".column-headings > [aria-label='Role']");
    const signalHeader = page.locator(".column-headings > [aria-label='Signal / Annotation']");
    await expect(frozenClock).toBeVisible();
    const initial = await viewport.evaluate((element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      return { left: rect.left + node.clientLeft, bottom: rect.bottom, width: node.clientWidth, scrollWidth: node.scrollWidth, scrollbarHeight: node.offsetHeight - node.clientHeight, scrollLeft: node.scrollLeft };
    });
    expect(initial.scrollWidth).toBeGreaterThan(initial.width);
    expect(initial.scrollLeft).toBe(0);
    test.skip(initial.scrollbarHeight === 0, "Native scrollbar-thumb drag requires a headed browser with a non-overlay scrollbar.");

    const thumbWidth = Math.max(24, initial.width * initial.width / initial.scrollWidth);
    const trackWidth = initial.width - thumbWidth;
    const startX = initial.left + thumbWidth / 2;
    const endX = startX + trackWidth * 0.76;
    const y = initial.bottom - initial.scrollbarHeight / 2;
    const fixedBefore = await Promise.all([leftHeader, roleHeader, signalHeader, frozenClock].map(async (locator) => (await locator.boundingBox())!.x));
    const revision = await host.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").innerText();
    const dirty = await page.getByTestId("dirty-status").innerText();
    const samples: Array<{ scrollLeft: number; fixedX: number[]; fixedVisible: boolean[] }> = [];

    await page.mouse.move(startX, y);
    await page.mouse.down();
    try {
      expect(await viewport.evaluate((element) => (element as HTMLElement).scrollLeft), "Pointerdown must grab the native thumb, not the track.").toBe(0);
      for (let frame = 1; frame <= 10; frame += 1) {
        await page.mouse.move(startX + (endX - startX) * frame / 10, y);
        await page.waitForTimeout(55);
        const positions = await Promise.all([leftHeader, roleHeader, signalHeader, frozenClock].map(async (locator) => ({ box: await locator.boundingBox(), visible: await locator.isVisible() })));
        samples.push({
          scrollLeft: await viewport.evaluate((element) => (element as HTMLElement).scrollLeft),
          fixedX: positions.map(({ box }) => box?.x ?? Number.NaN),
          fixedVisible: positions.map(({ visible }) => visible),
        });
      }
    } finally {
      await page.mouse.up();
    }

    expect(samples.some(({ scrollLeft }) => scrollLeft > 0)).toBe(true);
    expect(samples.at(-1)!.scrollLeft).toBeGreaterThan(initial.width);
    for (const sample of samples) {
      expect(sample.fixedVisible).toEqual([true, true, true, true]);
      sample.fixedX.forEach((x, index) => expect(x).toBeCloseTo(fixedBefore[index]!, 0));
    }
    await expect(host).toHaveAttribute("data-canonical-revision", revision!);
    await expect(page.getByTestId("history-status")).toHaveText(history);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
    expect(pageErrors).toEqual([]);
  });
}
