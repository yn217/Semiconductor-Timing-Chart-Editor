import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// Keep native scrollbar geometry available to the mouse-level acceptance in
// Chromium builds that default to zero-layout overlay scrollbars.
test.use({ launchOptions: { args: ["--disable-features=OverlayScrollbar,OverlayScrollbars"] } });

for (const viewportSize of [
  { width: 1672, height: 941 },
  { width: 1280, height: 720 },
]) {
  test(`Transaction tree stays outside horizontal viewport scroll at ${viewportSize.width}x${viewportSize.height}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      const isDefaultFaviconMiss = message.text().includes("Failed to load resource")
        && message.location().url.endsWith("/favicon.ico");
      if (message.type() === "error" && !isDefaultFaviconMiss) pageErrors.push(`${message.text()} @ ${message.location().url}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) pageErrors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    await page.setViewportSize(viewportSize);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

    const document = generatePerformanceDocument({ signalCount: 8, cycleCount: 120, profile: "transaction-heavy" });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: "issue-646-fixed-tree.tcd",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "8");
    await page.getByRole("button", { name: "Transaction", exact: true }).click();

    const tree = page.getByTestId("transaction-left-tree");
    const viewport = page.getByTestId("cycle-viewport");
    const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first();
    await expect(tree).toBeVisible();
    await expect(bar).toBeVisible();

    const ownership = await tree.evaluate((element) => ({
      parentViewport: element.parentElement?.closest(".cycle-viewport") !== null,
      treeLeft: element.getBoundingClientRect().left,
      treeTop: element.getBoundingClientRect().top,
      treeBottom: element.getBoundingClientRect().bottom,
      panelLeft: element.closest(".cycle-panel")!.getBoundingClientRect().left,
      panelBottom: element.closest(".cycle-panel")!.getBoundingClientRect().bottom,
      headerBottom: document.querySelector<HTMLElement>("[data-testid='transaction-tree-header']")!.getBoundingClientRect().bottom,
    }));
    expect(ownership.parentViewport).toBe(false);
    expect(Math.abs(ownership.treeLeft - ownership.panelLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(ownership.treeTop - ownership.headerBottom)).toBeLessThanOrEqual(1);
    expect(ownership.treeBottom).toBeLessThan(ownership.panelBottom);
    const clipPath = await page.locator(".non-split-signal-content").evaluate((element) => getComputedStyle(element).clipPath);
    expect(clipPath).toContain("inset");

    const host = page.getByTestId("cycle-surface");
    const baseline = {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    await bar.click();
    const selectedId = await bar.getAttribute("data-transaction-id");
    await expect(bar).toHaveAttribute("data-selected", "true");
    await expect(page.locator(".inspector-shell code").first()).toHaveAttribute("title", selectedId!);

    const before = await Promise.all([
      viewport.evaluate((element) => ({
        left: element.getBoundingClientRect().left,
        top: element.getBoundingClientRect().top,
        width: element.clientWidth,
        height: element.clientHeight,
        offsetHeight: element.offsetHeight,
        scrollbarHeight: element.offsetHeight - element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollLeft: element.scrollLeft,
        maxScroll: element.scrollWidth - element.clientWidth,
      })),
      bar.evaluate((element) => element.getBoundingClientRect().left),
      tree.evaluate((element) => element.getBoundingClientRect().left),
    ]);
    const [viewMetrics, barLeftBefore, treeLeftBefore] = before;
    expect(viewMetrics.scrollWidth).toBeGreaterThan(viewMetrics.width);

    // Drag the real native horizontal scrollbar thumb (not scrollLeft or a
    // wheel event) to prove that the timeline viewport itself owns X scrolling.
    const scrollbarY = viewMetrics.top + viewMetrics.height + viewMetrics.scrollbarHeight / 2;
    const thumbWidth = Math.max(18, viewMetrics.width * viewMetrics.width / viewMetrics.scrollWidth);
    const thumbStartX = viewMetrics.left + Math.max(20, thumbWidth / 2);
    const sampledTreeLeft: number[] = [];
    const dragThumb = async (fromX: number, targetX: number) => {
      await page.mouse.move(fromX, scrollbarY);
      await page.mouse.down();
      for (const fraction of [0.2, 0.45, 0.7, 1]) {
        const pointerX = fromX + (targetX - fromX) * fraction;
        await page.mouse.move(pointerX, scrollbarY, { steps: 2 });
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
        sampledTreeLeft.push(await tree.evaluate((element) => element.getBoundingClientRect().left));
        await expect(tree).toBeVisible();
      }
      await page.mouse.up();
    };
    const midX = viewMetrics.left + viewMetrics.width / 2;
    const farX = viewMetrics.left + viewMetrics.width - thumbWidth / 2 - 4;
    await dragThumb(thumbStartX, midX);
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(viewMetrics.maxScroll * 0.35);
    const midScrollLeft = await viewport.evaluate((element) => element.scrollLeft);
    expect(midScrollLeft).toBeLessThan(viewMetrics.maxScroll * 0.65);
    // The pointer remains at the center of the thumb after the mid-range drag.
    await dragThumb(midX, farX);
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const scrolledLeft = await viewport.evaluate((element) => element.scrollLeft);
    expect(scrolledLeft).toBeGreaterThan(viewMetrics.maxScroll * 0.8);
    const barLeftAfter = await bar.evaluate((element) => element.getBoundingClientRect().left);
    const treeLeftAfter = await tree.evaluate((element) => element.getBoundingClientRect().left);
    expect(barLeftAfter).toBeLessThan(barLeftBefore);
    expect(Math.abs(treeLeftAfter - treeLeftBefore)).toBeLessThanOrEqual(1);
    expect(sampledTreeLeft.every((left) => Math.abs(left - treeLeftBefore) <= 1)).toBe(true);

    // A real visible Tree selection must not cause the browser to reveal the
    // target by resetting the timeline's horizontal scroll position.
    const row = tree.locator(".transaction-left-tree-row").first();
    await row.click();
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(scrolledLeft);
    await expect(row).toHaveAttribute("data-selected", "true");
    await expect(bar).toBeVisible();
    await expect(page.locator(".inspector-shell code").first()).toHaveAttribute("title", selectedId!);
    await testInfo.attach("transaction-tree-after-real-scrollbar-drag.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Cycle");
    await page.getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");
    await expect(tree).toBeVisible();
    await expect(tree.locator(`[data-transaction-tree-id="${selectedId}"]`)).toHaveAttribute("data-selected", "true");
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(scrolledLeft);
    await page.getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Split");
    await page.getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");
    await expect(tree).toBeVisible();
    await expect(tree.locator(`[data-transaction-tree-id="${selectedId}"]`)).toHaveAttribute("data-selected", "true");
    expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(scrolledLeft);
    expect(await host.getAttribute("data-canonical-revision")).toBe(baseline.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(baseline.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(baseline.dirty);
    expect(pageErrors).toEqual([]);
  });
}
