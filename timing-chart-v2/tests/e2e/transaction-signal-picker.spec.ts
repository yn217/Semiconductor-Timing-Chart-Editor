import { expect, test } from "@playwright/test";

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

test("Transaction Inspector uses a bounded searchable linked-signal picker", async ({ page }) => {
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
  const linked = inspector.getByTestId("transaction-linked-signals");
  await expect(linked.locator("input[type='checkbox']")).toHaveCount(0);
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
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const unlink = linked.getByRole("button", { name: "Unlink DATA" });
  await expect(unlink).toHaveAttribute("data-icon-button", "close");
  await unlink.focus();
  await unlink.press("Enter");
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(linked.getByTestId("linked-signal-list")).toContainText("DATA");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(linked.getByTestId("linked-signal-list")).toContainText("No linked signals");
});

test("10k Signal Transaction Inspector keeps picker DOM bounded and preserves hierarchy context", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const document = largeTransactionDocument(10_000);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "large-picker.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "10000", { timeout: 60_000 });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "1", { timeout: 60_000 });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  await page.getByTestId("transaction-editor").getByRole("button", { name: /Bulk transaction/ }).click();

  const linked = page.getByTestId("inspector").getByTestId("transaction-linked-signals");
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
  await list.evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(() => list.locator(".transaction-list-row").count()).toBeLessThan(100);
});
