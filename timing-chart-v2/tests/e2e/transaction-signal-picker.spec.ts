import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

function largeTransactionDocument(signalCount: number) {
  const signals = Array.from({ length: signalCount }, (_, index) => ({
    id: `sig_bulk_${String(index).padStart(5, "0")}`,
    name: "REQ",
    type: "binary",
    role: "internal",
    source: { instancePath: ["top", `block_${String(index).padStart(5, "0")}`], signalName: "req" },
    display: { name: "REQ" },
    values: [{ start: 0, value: 0 }, { start: 4, value: 1 }],
  }));
  return {
    formatVersion: 2,
    document: { id: "large-picker", title: "Large Picker", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
    timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_bulk", name: "Bulk", rows: signals.map((signal) => signal.id) }],
    signals,
    bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [],
    transactions: [{ id: "txn_bulk", name: "Bulk transaction", start: 1, end: 3, laneId: "lane_0", linkedSignals: [signals[0]!.id, signals.at(-1)!.id] }],
    constraints: [], legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  };
}

test("Bottom Linked Signals tab owns the bounded picker and Inspector stays a live summary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  const editor = page.getByTestId("transaction-editor");
  await editor.getByLabel("New Transaction name").fill("Picker test");
  await editor.getByLabel("New Transaction start").fill("1");
  await editor.getByLabel("New Transaction end").fill("3");
  await editor.getByRole("button", { name: "Create Transaction" }).click();

  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByTestId("transaction-linked-signals")).toHaveCount(0);
  await inspector.getByTestId("manage-transaction-links").click();
  const linked = page.getByTestId("transaction-linked-signals");
  await expect(page.getByTestId("transaction-linked-signals")).toHaveCount(1);
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
  await linked.getByTestId("open-linked-signal-picker").click();
  const picker = linked.getByTestId("linked-signal-picker");
  await picker.getByLabel("Search linked signals").fill("DATA");
  const result = picker.getByRole("option", { name: /DATA/ });
  await expect(result).toHaveCount(1);
  const results = picker.getByTestId("linked-signal-results");
  await results.focus();
  await results.press("ArrowDown");
  await results.press("Home");
  await results.press("End");
  await expect(results).toHaveAttribute("aria-activedescendant", /linked-signal-option-/);
  await results.press("Enter");
  await expect(linked.getByTestId("linked-signal-list")).toContainText("DATA");
  await expect(inspector.getByTestId("inspector-linked-signal-summary")).toContainText("DATA");
  await expect(linked.getByTestId("linked-signal-picker")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const unlink = linked.getByRole("button", { name: "Unlink DATA" });
  await expect(unlink).toHaveAttribute("data-icon-button", "close");
  await unlink.focus();
  await unlink.press("Enter");
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const bottomTabs = page.getByTestId("bottom-tabs");
  await expect(bottomTabs.getByRole("tab", { name: "Linked Signals" })).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByTestId("inspector-linked-signal-summary")).toContainText("No linked Signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(inspector.getByTestId("manage-transaction-links")).toBeVisible();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(linked.getByTestId("linked-signal-list")).toContainText("DATA");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
});

test("10k Signal Bottom Linked Signals editor keeps picker DOM bounded and preserves hierarchy context", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const document = largeTransactionDocument(10_000);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "large-picker.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "10000", { timeout: 60_000 });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "1", { timeout: 60_000 });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  await page.getByTestId("transaction-editor").getByRole("button", { name: /Bulk transaction/ }).click();

  await page.getByTestId("inspector").getByTestId("manage-transaction-links").click();
  const linked = page.getByTestId("transaction-linked-signals");
  await expect(linked).toHaveCount(1);
  await expect(linked.getByTestId("linked-signal-list").locator(".transaction-linked-item")).toHaveCount(2);
  await linked.getByTestId("open-linked-signal-picker").click();
  const picker = linked.getByTestId("linked-signal-picker");
  const results = picker.getByTestId("linked-signal-results");
  await expect(results.getByRole("option")).toHaveCount(50);
  await picker.getByLabel("Search linked signals").fill("block_09999");
  const result = results.getByRole("option");
  await expect(result).toHaveCount(1);
  await expect(result).toContainText("top.block_09999");
  expect(await picker.locator("button").count()).toBeLessThanOrEqual(50);
});

test("10k Transaction Bottom table mounts only a bounded viewport slice", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const source = largeTransactionDocument(1);
  const document = {
    ...source,
    document: { ...source.document, id: "large-transactions" },
    timeline: { ...source.timeline, cycleCount: 20_000, end: 20_000 },
    transactions: Array.from({ length: 10_000 }, (_, index) => ({
      id: `txn_bulk_${String(index).padStart(5, "0")}`,
      name: `Transaction ${index}`,
      start: index,
      end: index + 1,
      laneId: "lane_0",
    })),
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "large-transactions.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "10000", { timeout: 60_000 });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  const list = page.getByTestId("transaction-editor").locator(".transaction-list");
  await expect.poll(() => list.locator(".transaction-list-row").count()).toBeLessThan(100);
  await list.evaluate(async (element) => { element.scrollTop = element.scrollHeight; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect.poll(() => list.locator(".transaction-list-row").count()).toBeLessThan(100);
});

test("Transaction Bottom table stays viewport-bounded across 1k, 5k, and 10k fixtures", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const source = largeTransactionDocument(1);
  const measurements: { count: number; loadMs: number; mountedRows: number }[] = [];
  for (const count of [1_000, 5_000, 10_000]) {
    const document = {
      ...source,
      document: { ...source.document, id: `perf-transactions-${count}` },
      timeline: { ...source.timeline, cycleCount: count * 2, end: count * 2 },
      transactions: Array.from({ length: count }, (_, index) => ({
        id: `txn_perf_${String(index).padStart(5, "0")}`,
        name: `Transaction ${index}`,
        start: index,
        end: index + 1,
        laneId: `lane_${index % 8}`,
      })),
    };
    const started = await page.evaluate(() => performance.now());
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `perf-transactions-${count}.tcd.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", String(count), { timeout: 60_000 });
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    if (count === 1_000) {
      await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
      await page.getByLabel("Workspace preset").selectOption("transaction");
    }
    const list = page.getByTestId("transaction-editor").locator(".transaction-list");
    const mountedRows = await list.locator(".transaction-list-row").count();
    const finished = await page.evaluate(() => performance.now());
    measurements.push({ count, loadMs: Math.round(finished - started), mountedRows });
    expect(mountedRows).toBeLessThan(100);
  }
  console.log(`[transaction-table-performance] ${JSON.stringify(measurements)}`);
});
