import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }] as const) {
  test(`500-Transaction Open reaches first useful Transaction paint at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const lanes = page.getByTestId("transaction-lanes");
    await expect(lanes).toBeVisible();
    await expect(surface).toHaveAttribute("data-editor-idle", "true");

    const before = await surface.evaluate((element) => JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>);
    const document = generatePerformanceDocument({ signalCount: 500, cycleCount: 1000, profile: "transaction-heavy" });
    const openStartedAt = Date.now();
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: "large-500-transaction-startup.tcd",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    const discard = page.getByTestId("unsaved-discard");
    if (await discard.isVisible().catch(() => false)) await discard.click();

    await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title, { timeout: 60_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Transaction 0");
    const readTransactionLaneState = () => lanes.evaluate((laneRoot) => {
      const laneElement = laneRoot as HTMLElement;
      return {
        attributes: { laneIndexBuilds: laneElement.dataset.laneIndexBuilds, stackRowBuilds: laneElement.dataset.stackRowBuilds, treeRowBuilds: laneElement.dataset.treeRowBuilds },
        totalHeight: laneElement.style.height,
        laneBands: laneElement.querySelectorAll(".transaction-lane").length,
        labels: laneElement.querySelectorAll(".transaction-lane-label").length,
        bars: [...laneElement.querySelectorAll<HTMLElement>("[data-transaction-id]")].map((bar) => ({ id: bar.dataset.transactionId, left: bar.style.left, width: bar.style.width })),
        geometryGuides: [...laneElement.querySelectorAll<HTMLElement>(".transaction-geometry-line")].slice(0, 12).map((guide) => ({ cycle: guide.dataset.cycle, left: guide.style.left })),
      };
    });
    await expect.poll(async () => (await readTransactionLaneState()).bars.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const paintedLaneState = await readTransactionLaneState();
    const after = await surface.evaluate((element) => {
      const counters = JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
      return {
        counters,
        visibleTreeRows: element.ownerDocument.querySelectorAll("[data-testid='transaction-left-tree'] [data-transaction-tree-id]").length,
        idle: element.getAttribute("data-editor-idle") === "true",
      };
    });
    const delta = (key: string) => (after.counters[key] ?? 0) >= (before[key] ?? 0) ? (after.counters[key] ?? 0) - (before[key] ?? 0) : (after.counters[key] ?? 0);
    const projectionDelta = {
      projectionCalls: delta("projectionCalls"),
      fullReplaceCalls: delta("fullReplaceCalls"),
      viewportOnlyCalls: delta("viewportOnlyCalls"),
      changeCalls: delta("changeCalls"),
    };

    console.log(JSON.stringify({ viewport, canonicalTransactions: document.transactions.length, openAndPaintElapsedMs: Date.now() - openStartedAt, projectionDelta, laneIndex: paintedLaneState.attributes, totalHeight: paintedLaneState.totalHeight, laneBands: paintedLaneState.laneBands, visibleBars: paintedLaneState.bars.length, firstBar: paintedLaneState.bars[0], geometryGuides: paintedLaneState.geometryGuides.length, ...after }));
    expect(document.transactions).toHaveLength(500);
    expect(after.idle).toBe(true);
    expect(paintedLaneState.bars.some((bar) => bar.id === "txn_perf_0" && Number.parseFloat(bar.width) > 0), JSON.stringify({ viewport, projectionDelta, paintedLaneState })).toBe(true);
    expect(after.visibleTreeRows).toBeGreaterThan(0);
    expect(projectionDelta.projectionCalls).toBeGreaterThan(0);
    expect(projectionDelta.fullReplaceCalls).toBeGreaterThan(0);
  });
}
