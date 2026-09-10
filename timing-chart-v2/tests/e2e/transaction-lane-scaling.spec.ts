import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("10k Transaction fixture keeps mounted lane DOM viewport-bounded", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 500, profile: "transaction-heavy" });
  const document = { ...base, transactions: Array.from({ length: 10_000 }, (_, index) => ({ id: `txn_browser_${index}`, name: `Transaction ${index}`, start: (index * 3) % 490, end: ((index * 3) % 490) + 4, laneId: `lane_${index % 16}`, linkedSignals: [base.signals[index % base.signals.length]!.id] })) };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-10k.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "10000", { timeout: 60_000 });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible({ timeout: 60_000 });
  const metrics = await page.getByTestId("transaction-lanes").evaluate((element) => ({
    totalHeight: Number.parseFloat((element as HTMLElement).style.height),
    mountedBars: element.querySelectorAll("[data-transaction-id]").length,
    mountedTreeRows: element.querySelectorAll("[data-testid^='transaction-tree-row-']").length,
  }));
  expect(metrics.totalHeight).toBeGreaterThan(10_000);
  expect(metrics.mountedBars).toBeLessThan(1_000);
  expect(metrics.mountedTreeRows).toBeLessThan(1_000);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("central Transaction surface remains viewport-bounded across 1k/5k/10k with bounded mode, scroll, and selection work", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const measurements: Array<Record<string, number>> = [];
  for (const transactionCount of [1_000, 5_000, 10_000] as const) {
    if (transactionCount !== 1_000) {
      await page.reload();
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    }
    const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 500, profile: "transaction-heavy" });
    const document = {
      ...base,
      transactions: Array.from({ length: transactionCount }, (_, index) => ({
        id: `txn_latency_${transactionCount}_${index}`,
        name: `Transaction ${index}`,
        start: (index * 3) % 490,
        end: ((index * 3) % 490) + 4,
        laneId: `lane_${index % 16}`,
        linkedSignals: [base.signals[index % base.signals.length]!.id],
      })),
    };
    const started = await page.evaluate(() => performance.now());
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `transaction-${transactionCount}.tcd`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", String(transactionCount), { timeout: 60_000 });
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("transaction-lanes")).toBeVisible({ timeout: 60_000 });
    const modeReady = await page.evaluate((startedAt) => performance.now() - startedAt, started);
    const viewport = page.getByTestId("cycle-viewport");
    const metrics = await page.getByTestId("transaction-lanes").evaluate((element) => ({
      totalHeight: Number.parseFloat((element as HTMLElement).style.height),
      mountedBars: element.querySelectorAll("[data-transaction-id]").length,
      mountedTreeRows: element.querySelectorAll("[data-testid^='transaction-tree-row-']").length,
    }));
    const selected = page.getByTestId("transaction-lanes").locator("[data-transaction-id]:visible").first();
    const lanes = page.getByTestId("transaction-lanes");
    const mountSerial = await lanes.getAttribute("data-mount-serial");
    const laneIndexBuildsBeforeSelection = Number(await lanes.getAttribute("data-lane-index-builds"));
    const stackRowBuildsBeforeSelection = Number(await lanes.getAttribute("data-stack-row-builds"));
    const treeRowBuildsBeforeSelection = Number(await lanes.getAttribute("data-tree-row-builds"));
    const selectionStarted = await page.evaluate(() => performance.now());
    await selected.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(selected).toHaveAttribute("data-selected", "true");
    await expect(lanes).toHaveAttribute("data-lane-index-builds", String(laneIndexBuildsBeforeSelection));
    await expect(lanes).toHaveAttribute("data-stack-row-builds", String(stackRowBuildsBeforeSelection));
    await expect(lanes).toHaveAttribute("data-tree-row-builds", String(treeRowBuildsBeforeSelection));
    const selectionMs = await page.evaluate((startedAt) => performance.now() - startedAt, selectionStarted);
    const scrollStarted = await page.evaluate(() => performance.now());
    await viewport.evaluate((element) => { element.scrollTop = Math.max(1, (element.scrollHeight - element.clientHeight) / 2); element.dispatchEvent(new Event("scroll")); });
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const scrollMs = await page.evaluate((startedAt) => performance.now() - startedAt, scrollStarted);
    const inspector = page.getByTestId("inspector");
    const startInput = inspector.getByLabel("Transaction start");
    const endInput = inspector.getByLabel("Transaction end");
    const applyTransaction = inspector.getByTestId("apply-inspector-transaction");
    const repeatedMoveDurations: number[] = [];
    for (let move = 0; move < 10; move += 1) {
      const moveStarted = await page.evaluate(() => performance.now());
      await startInput.fill(String(move + 1));
      await endInput.fill(String(move + 5));
      await applyTransaction.click();
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      repeatedMoveDurations.push(await page.evaluate((startedAt) => performance.now() - startedAt, moveStarted));
      await expect(lanes).toHaveAttribute("data-mount-serial", mountSerial!);
    }
    const orderedMoveDurations = [...repeatedMoveDurations].sort((left, right) => left - right);
    // Keep the measurement as a real regression gate, not artifact-only
    // evidence. The limit is intentionally generous for shared CI hosts;
    // it still rejects the multi-second runaway observed before the indexed
    // Transaction presentation work.
    expect(Math.max(...repeatedMoveDurations)).toBeLessThan(5_000);
    expect(selectionMs).toBeLessThan(5_000);
    expect(scrollMs).toBeLessThan(5_000);
    expect(metrics.totalHeight).toBeGreaterThan(1_000);
    expect(metrics.mountedBars).toBeLessThan(1_000);
    expect(metrics.mountedTreeRows).toBeLessThan(1_000);
    measurements.push({ transactionCount, modeReadyMs: Math.round(modeReady), scrollMs: Math.round(scrollMs), selectionMs: Math.round(selectionMs), repeatedMoveP50Ms: Math.round(orderedMoveDurations[4] ?? 0), repeatedMoveP95Ms: Math.round(orderedMoveDurations[8] ?? 0), mountedBars: metrics.mountedBars, mountedTreeRows: metrics.mountedTreeRows });
  }
  await testInfo.attach("transaction-central-scale-latency.json", { body: Buffer.from(JSON.stringify(measurements, null, 2)), contentType: "application/json" });
  console.log(`[transaction-central-scale] ${JSON.stringify(measurements)}`);
});
