import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test.use({ launchOptions: { args: ["--disable-features=OverlayScrollbar,OverlayScrollbars"] } });

for (const viewportSize of [
  { width: 1672, height: 941 },
  { width: 1280, height: 720 },
]) {
  test(`Tree selection minimally reveals off-screen Transaction bars at ${viewportSize.width}x${viewportSize.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewportSize);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

    const generated = generatePerformanceDocument({ signalCount: 8, cycleCount: 1000, profile: "transaction-heavy" });
    const document = {
      ...generated,
      transactions: [
        { ...generated.transactions[0]!, id: "txn_near", name: "Near", start: 0, end: 5, laneId: "lane_0" },
        { ...generated.transactions[1]!, id: "txn_mid", name: "Mid", start: 480, end: 490, laneId: "lane_0" },
        { ...generated.transactions[2]!, id: "txn_far", name: "Far", start: 950, end: 960, laneId: "lane_0" },
      ],
      annotations: [],
      bookmarks: [],
      timeGroups: [],
    };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: "issue-650-select-reveal.tcd",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await page.getByRole("button", { name: "Transaction", exact: true }).click();

    const tree = page.getByTestId("transaction-left-tree");
    const viewport = page.getByTestId("cycle-viewport");
    const nearRow = tree.locator("[data-transaction-tree-id='txn_near']");
    const midRow = tree.locator("[data-transaction-tree-id='txn_mid']");
    const farRow = tree.locator("[data-transaction-tree-id='txn_far']");
    const nearBar = page.locator("[data-transaction-id='txn_near']");
    const midBar = page.locator("[data-transaction-id='txn_mid']");
    const farBar = page.locator("[data-transaction-id='txn_far']");
    await expect(tree).toBeVisible();
    await expect(nearBar).toBeVisible();
    await expect(midBar).toBeVisible();
    await expect(farBar).toBeVisible();
    const scrollMetrics = await viewport.evaluate((element) => ({
      rect: element.getBoundingClientRect().toJSON(),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      offsetHeight: element.offsetHeight,
      clientHeight: element.clientHeight,
      scrollLeft: element.scrollLeft,
      maxScroll: element.scrollWidth - element.clientWidth,
    }));
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
    expect(scrollMetrics.maxScroll).toBeGreaterThan(0);
    const baseline = {
      revision: await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };

    // Selecting an already-visible bar must not disturb the current view.
    const nearPosition = await nearBar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    expect(nearPosition.left).toBeGreaterThanOrEqual(scrollMetrics.rect.left - 1);
    expect(nearPosition.right).toBeLessThanOrEqual(scrollMetrics.rect.right + 1);
    await nearRow.click();
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(scrollMetrics.scrollLeft);

    // Use actual horizontal wheel input to position the timeline away from
    // cycle 0. The Tree is fixed outside this scroll owner, so its rows remain
    // genuinely clickable during the scroll.
    await page.mouse.move(scrollMetrics.rect.left + scrollMetrics.clientWidth / 2, scrollMetrics.rect.top + scrollMetrics.clientHeight / 2);
    await page.mouse.wheel(scrollMetrics.maxScroll * 0.45, 0);
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(scrollMetrics.maxScroll * 0.35);
    const preMidSelection = await viewport.evaluate((element) => element.scrollLeft);

    await expect(midRow).toBeVisible();
    const preMidBar = await midBar.evaluate((element) => element.getBoundingClientRect().toJSON());
    const preMidViewport = await viewport.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(preMidBar.left >= preMidViewport.right || preMidBar.right <= preMidViewport.left).toBe(true);
    const treeLeftBeforeMid = await tree.evaluate((element) => element.getBoundingClientRect().left);
    await midRow.click();
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).not.toBe(preMidSelection);
    await expect.poll(async () => {
      const viewportRect = await viewport.evaluate((element) => element.getBoundingClientRect().toJSON());
      const barRect = await midBar.evaluate((element) => element.getBoundingClientRect().toJSON());
      return barRect.left >= viewportRect.left - 1 && barRect.right <= viewportRect.right + 1;
    }).toBe(true);
    const midScroll = await viewport.evaluate((element) => element.scrollLeft);
    expect(midScroll).toBeGreaterThan(0);
    expect(Math.abs(await tree.evaluate((element) => element.getBoundingClientRect().left) - treeLeftBeforeMid)).toBeLessThanOrEqual(1);

    const preFarSelection = midScroll;
    await farRow.click();
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(preFarSelection);
    await expect.poll(async () => {
      const viewportRect = await viewport.evaluate((element) => element.getBoundingClientRect().toJSON());
      const barRect = await farBar.evaluate((element) => element.getBoundingClientRect().toJSON());
      return barRect.left >= viewportRect.left - 1 && barRect.right <= viewportRect.right + 1;
    }).toBe(true);
    const farScroll = await viewport.evaluate((element) => element.scrollLeft);
    await farRow.click();
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(farScroll);

    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", baseline.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(baseline.history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty!);
    await expect(tree).toBeVisible();
    await testInfo.attach("transaction-tree-select-reveal.png", { body: await page.screenshot(), contentType: "image/png" });
    console.log(JSON.stringify({ viewportSize, maxScroll: scrollMetrics.maxScroll, midScroll, farScroll, finalBarRects: { mid: await midBar.boundingBox(), far: await farBar.boundingBox() } }));
  });
}
