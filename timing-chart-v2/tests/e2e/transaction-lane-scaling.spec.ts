import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

for (const viewportSize of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) test(`standalone Transaction mode exposes horizontal overflow at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
  await page.setViewportSize(viewportSize);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 40, cycleCount: 1000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-long.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "40", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const viewport = page.getByTestId("cycle-viewport");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  const metrics = await viewport.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollLeft: element.scrollLeft }));
  console.log(`[transaction-overflow] ${JSON.stringify(metrics)}`);
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  await viewport.evaluate((element) => { element.scrollLeft = Math.min(120, element.scrollWidth - element.clientWidth); element.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(dirty);
});

test("10k Transaction fixture keeps mounted lane DOM viewport-bounded", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 500, profile: "transaction-heavy" });
  const document = { ...base, transactions: Array.from({ length: 10_000 }, (_, index) => ({ id: `txn_browser_${index}`, name: `Transaction ${index}`, start: (index * 3) % 490, end: ((index * 3) % 490) + 4, laneId: `lane_${index % 16}`, linkedSignals: [base.signals[index % base.signals.length]!.id] })) };
  expect(document.transactions).toHaveLength(10_000);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-10k.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "10000", { timeout: 60_000 });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible({ timeout: 60_000 });
  const metrics = await page.getByTestId("transaction-lanes").evaluate((element) => ({
    totalHeight: Number.parseFloat((element as HTMLElement).style.height),
    mountedBars: element.querySelectorAll("[data-transaction-id]").length,
    mountedCenterTransactionLabels: element.querySelectorAll(".transaction-lane-label-row").length,
    filterBuilds: Number((element as HTMLElement).dataset.transactionFilterBuilds),
  }));
  // Transactions are packed into a bounded number of lanes; height is not a
  // proxy for transaction count. The layout must simply be present.
  expect(metrics.totalHeight).toBeGreaterThan(0);
  expect(metrics.mountedBars).toBeLessThan(1_000);
  expect(metrics.mountedCenterTransactionLabels).toBe(0);
  const firstVisibleBar = page.getByTestId("transaction-lanes").locator("[data-transaction-id]:visible").first();
  await firstVisibleBar.click();
  await expect(firstVisibleBar).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("transaction-lanes")).toHaveAttribute("data-transaction-filter-builds", String(metrics.filterBuilds));
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("standalone Transaction cycle viewport scroll advances the virtualized lane window", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 40, cycleCount: 500, profile: "transaction-heavy" });
  const document = { ...base, transactions: Array.from({ length: 2_000 }, (_, index) => ({ id: `txn_scroll_${index}`, name: `Transaction ${index}`, start: (index * 3) % 490, end: ((index * 3) % 490) + 4, laneId: `lane_${index % 16}`, linkedSignals: [base.signals[index % base.signals.length]!.id] })) };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-scroll.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "2000", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const lanes = page.getByTestId("transaction-lanes");
  const viewport = page.getByTestId("cycle-viewport");
  await expect(page.getByTestId("transaction-left-tree")).toBeVisible();
  const visibleIdsBefore = await lanes.locator("[data-transaction-id]").evaluateAll((bars) => bars.map((bar) => bar.getAttribute("data-transaction-id")).filter((id): id is string => id !== null).sort());
  await viewport.evaluate((element) => { element.scrollTop = Math.min(600, element.scrollHeight - element.clientHeight); });
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(async () => lanes.locator("[data-transaction-id]").evaluateAll((bars) => bars.map((bar) => bar.getAttribute("data-transaction-id")).filter((id): id is string => id !== null).sort())).not.toEqual(visibleIdsBefore);
  await expect(lanes.locator("[data-transaction-id]")).not.toHaveCount(0);
});

test("selected Transaction drag survives a horizontal virtualization window change", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 50, cycleCount: 1_000, profile: "transaction-heavy" });
  const transaction = { id: "txn_drag_window", name: "Window crossing", start: 20, end: 40, laneId: "lane_0", linkedSignals: [base.signals[0]!.id] };
  const document = { ...base, transactions: [transaction] };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-drag-window.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "1", { timeout: 60_000 });
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const viewport = page.getByTestId("cycle-viewport");
  const bar = page.locator("[data-transaction-id='txn_drag_window']");
  await expect(bar).toBeVisible();
  const before = await bar.boundingBox();
  expect(before).not.toBeNull();
  const startX = before!.x + before!.width - 2;
  const y = before!.y + before!.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 12, y, { steps: 2 });
  await viewport.evaluate((element) => {
    const node = element as HTMLElement;
    node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    node.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(bar).toHaveAttribute("data-selected", "true");
  const targetTick = page.locator(".cycle-ruler .cycle-tick[data-source-cycle='900']");
  await expect(targetTick).toBeAttached();
  const target = await targetTick.boundingBox();
  expect(target).not.toBeNull();
  await page.mouse.move(target!.x + 1, y, { steps: 4 });
  await expect(bar).toHaveAttribute("data-drag-preview", "true");
  await page.mouse.up();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  // Transaction Inspector displays TC units (10 system cycles per TC).
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("90");
});

test("Transaction Fit All and Fit Selection remain view-only", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first();
  await expect(bar).toBeVisible();
  await bar.click();
  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("200");
  await expect(page.getByTestId("zoom-status")).toHaveText("200%");
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit Selection", exact: true }).click();
  await expect.poll(() => page.getByTestId("zoom-status").textContent()).not.toBe("200%");
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect.poll(() => page.getByTestId("cycle-viewport").evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit All", exact: true }).click();
  await expect.poll(() => page.getByTestId("cycle-viewport").evaluate((element) => element.scrollLeft)).toBe(0);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
});

test("Transaction view state survives both mode-switch directions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const host = page.getByTestId("cycle-surface");
  const viewport = page.getByTestId("cycle-viewport");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("150");
  await expect(page.getByTestId("zoom-status")).toHaveText("150%");
  await viewport.evaluate((element) => { element.scrollLeft = Math.min(120, element.scrollWidth - element.clientWidth); });
  const state = { zoom: await host.getAttribute("data-zoom"), scrollLeft: await viewport.evaluate((element) => element.scrollLeft), revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  expect(await host.getAttribute("data-zoom")).toBe(state.zoom);
  expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(state.scrollLeft);
  expect(await host.getAttribute("data-canonical-revision")).toBe(state.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(state.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(state.dirty);
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
    expect(document.transactions).toHaveLength(transactionCount);
    const started = await page.evaluate(() => performance.now());
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `transaction-${transactionCount}.tcd`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", String(transactionCount), { timeout: 60_000 });
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("transaction-lanes")).toBeVisible({ timeout: 60_000 });
    const modeReady = await page.evaluate((startedAt) => performance.now() - startedAt, started);
    // Standalone TransactionLanes subscribes to the cycle viewport for its
    // vertical window. The Left Tree scroll is independent and must not stand
    // in for Lane virtualization evidence.
    const viewport = page.getByTestId("cycle-viewport");
    const metrics = await page.getByTestId("transaction-lanes").evaluate((element) => ({
      totalHeight: Number.parseFloat((element as HTMLElement).style.height),
      mountedBars: element.querySelectorAll("[data-transaction-id]").length,
      mountedCenterTransactionLabels: element.querySelectorAll(".transaction-lane-label-row").length,
    }));
    const selected = page.getByTestId("transaction-lanes").locator("[data-transaction-id]:visible").first();
    const lanes = page.getByTestId("transaction-lanes");
    const mountSerial = await lanes.getAttribute("data-mount-serial");
    const laneIndexBuildsBeforeSelection = Number(await lanes.getAttribute("data-lane-index-builds"));
    const stackRowBuildsBeforeSelection = Number(await lanes.getAttribute("data-stack-row-builds"));
    const selectionStarted = await page.evaluate(() => performance.now());
    await selected.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(selected).toHaveAttribute("data-selected", "true");
    await expect(lanes).toHaveAttribute("data-lane-index-builds", String(laneIndexBuildsBeforeSelection));
    await expect(lanes).toHaveAttribute("data-stack-row-builds", String(stackRowBuildsBeforeSelection));
    expect(metrics.mountedCenterTransactionLabels).toBe(0);
    const selectionMs = await page.evaluate((startedAt) => performance.now() - startedAt, selectionStarted);
    const scrollStarted = await page.evaluate(() => performance.now());
    const mountedIdsBeforeScroll = await lanes.locator("[data-transaction-id]").evaluateAll((bars) => bars.map((bar) => bar.getAttribute("data-transaction-id")).filter((id): id is string => id !== null).sort());
    await viewport.evaluate((element) => { element.scrollTop = Math.max(1, (element.scrollHeight - element.clientHeight) / 2); element.dispatchEvent(new Event("scroll")); });
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect.poll(async () => lanes.locator("[data-transaction-id]").evaluateAll((bars) => bars.map((bar) => bar.getAttribute("data-transaction-id")).filter((id): id is string => id !== null).sort())).not.toEqual(mountedIdsBeforeScroll);
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
    // Lane height reflects packed lane layout, not transaction count.
    expect(metrics.totalHeight).toBeGreaterThan(0);
    expect(metrics.mountedBars).toBeLessThan(1_000);
    expect(metrics.mountedCenterTransactionLabels).toBe(0);
    measurements.push({ transactionCount, modeReadyMs: Math.round(modeReady), scrollMs: Math.round(scrollMs), selectionMs: Math.round(selectionMs), repeatedMoveP50Ms: Math.round(orderedMoveDurations[4] ?? 0), repeatedMoveP95Ms: Math.round(orderedMoveDurations[8] ?? 0), mountedBars: metrics.mountedBars, mountedCenterTransactionLabels: metrics.mountedCenterTransactionLabels });
  }
  await testInfo.attach("transaction-central-scale-latency.json", { body: Buffer.from(JSON.stringify(measurements, null, 2)), contentType: "application/json" });
  console.log(`[transaction-central-scale] ${JSON.stringify(measurements)}`);
});

test("single-lane Transaction edits remain bounded on a large sequential fixture", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 40, cycleCount: 500, profile: "transaction-heavy" });
  const document = {
    ...base,
    transactions: Array.from({ length: 10_000 }, (_, index) => ({
      id: `txn_single_lane_${index}`,
      name: `Transaction ${index}`,
      start: index % 490,
      end: (index % 490) + 4,
      laneId: "lane_sequential",
      linkedSignals: [base.signals[index % base.signals.length]!.id],
    })),
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-single-lane-10k.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "10000", { timeout: 60_000 });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const lanes = page.getByTestId("transaction-lanes");
  await expect(lanes).toBeVisible({ timeout: 60_000 });
  const selected = lanes.locator("[data-transaction-id]:visible").first();
  await selected.evaluate((element) => (element as HTMLButtonElement).click());
  const stackBuilds = await lanes.getAttribute("data-stack-row-builds");
  const stackBuildCount = Number(stackBuilds);
  const startInput = page.getByTestId("inspector").getByLabel("Transaction start");
  await page.getByTestId("inspector").getByLabel("Transaction end").fill("16");
  await startInput.fill("12");
  await page.getByTestId("inspector").getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await expect.poll(() => lanes.getAttribute("data-stack-row-builds")).toBe(String(stackBuildCount + 2));
  await expect(lanes.locator(".transaction-lane-label-row")).toHaveCount(0);
});
