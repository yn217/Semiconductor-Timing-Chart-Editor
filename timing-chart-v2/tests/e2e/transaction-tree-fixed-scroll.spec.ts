import { expect, test } from "@playwright/test";

for (const viewportSize of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction Tree remains fixed during a real scrollbar drag at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewportSize);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

    const tree = page.getByTestId("transaction-left-tree");
    const viewport = page.getByTestId("cycle-viewport");
    const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_fetch']");
    await expect(tree).toContainText("Memory");
    await expect(bar).toBeVisible();
    expect(await tree.evaluate((element) => element.closest(".cycle-viewport"))).toBeNull();
    const initial = await viewport.evaluate((element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left + node.clientLeft,
        bottom: rect.bottom,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        scrollbarHeight: node.offsetHeight - node.clientHeight,
        scrollLeft: node.scrollLeft,
      };
    });
    expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
    expect(initial.scrollLeft).toBe(0);
    test.skip(initial.scrollbarHeight === 0, "Native scrollbar thumb drag requires a headed browser with a non-overlay scrollbar.");

    const thumbWidth = Math.max(24, initial.clientWidth * initial.clientWidth / initial.scrollWidth);
    const trackWidth = initial.clientWidth - thumbWidth;
    const treeBoxBefore = await tree.boundingBox();
    if (!treeBoxBefore) throw new Error("Transaction Tree has no visible geometry");
    const startX = initial.left + thumbWidth / 2;
    const endX = startX + trackWidth * 0.82;
    const y = initial.bottom - initial.scrollbarHeight / 2;
    const treeXBefore = treeBoxBefore.x;
    const barXBefore = (await bar.boundingBox())!.x;
    const revision = await host.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").innerText();
    const dirty = await page.getByTestId("dirty-status").innerText();
    const samples: Array<{ readonly scrollLeft: number; readonly treeX: number; readonly barX: number; readonly treeVisible: boolean }> = [];

    await page.mouse.move(startX, y);
    await page.mouse.down();
    try {
      const scrollAfterPointerDown = await viewport.evaluate((element) => (element as HTMLElement).scrollLeft);
      expect(scrollAfterPointerDown, "Pointerdown must land on the visible native scrollbar thumb, not the track.").toBe(initial.scrollLeft);
      for (let step = 1; step <= 10; step += 1) {
        await page.mouse.move(startX + (endX - startX) * step / 10, y);
        await page.waitForTimeout(70);
        const treeBox = await tree.boundingBox();
        const barBox = await bar.boundingBox();
        const scrollLeft = await viewport.evaluate((element) => (element as HTMLElement).scrollLeft);
        samples.push({ scrollLeft, treeX: treeBox?.x ?? Number.NaN, barX: barBox?.x ?? Number.NaN, treeVisible: treeBox !== null });
      }
    } finally {
      await page.mouse.up();
    }

    expect(samples.some((sample) => sample.scrollLeft > 0)).toBe(true);
    expect(samples.at(-1)!.scrollLeft).toBeGreaterThan(initial.clientWidth);
    for (const sample of samples) {
      expect(sample.treeVisible).toBe(true);
      expect(sample.treeX).toBeCloseTo(treeXBefore, 0);
    }
    expect(samples.at(-1)!.barX).toBeLessThan(barXBefore);
    await expect(tree).toContainText("Fetch_0");

    for (const mode of ["Cycle", "Combined", "Transaction"] as const) {
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      await expect(page.locator(".view-mode").getByRole("button", { name: mode, exact: true })).toHaveClass(/active/);
      if (mode === "Transaction") {
        await expect(tree).toBeVisible();
        expect((await tree.boundingBox())!.x).toBeCloseTo(treeXBefore, 0);
      }
    }
    await expect(host).toHaveAttribute("data-canonical-revision", revision!);
    await expect(page.getByTestId("history-status")).toHaveText(history);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
  });
}
