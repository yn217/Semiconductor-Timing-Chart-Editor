import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const samplePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

test("default browser startup opens the built-in Transaction sample", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Memory");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Memory read transaction");
  await expect(page.locator(".transaction-bookmark-markers [data-bookmark-id='demo_bookmark_read_start']")).toBeVisible();
  await page.locator(".transaction-bookmark-markers [data-bookmark-id='demo_bookmark_read_start']").click();
  await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
  await expect(page.getByTestId("bookmark-row-demo_bookmark_read_start")).toHaveAttribute("data-selected", "true");
});

test("Transaction crossing a collapsed TimeGroup renders an Axis Break gap", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }, { id: "fold-30-50", name: "Nested Fold", start: 30, end: 50, presentation: { collapsed: true } }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 10;
  transaction.end = 60;

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-fold.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  const bar = page.locator('[data-transaction-id="txn_read0"]');
  await expect(bar).toBeVisible();
  const gap = bar.locator(".transaction-axis-break-gap");
  await expect(gap).toBeVisible();
  await expect(gap).toHaveCount(1);
  await expect(bar.locator("[data-transaction-segment='true']")).toHaveCount(2);
  await expect(bar.locator("[data-phase-segment='true']")).toHaveCount(2);
  const barBox = await bar.boundingBox();
  const gapBox = await gap.boundingBox();
  expect(barBox?.width).toBeGreaterThan(0);
  expect(gapBox?.width).toBeGreaterThan(0);
  await bar.click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("10");
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("60");
});

test("Transaction fully inside a collapsed TimeGroup remains selectable", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-0-100", name: "Fold", start: 0, end: 100, presentation: { collapsed: true } }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 25;
  transaction.end = 35;
  transaction.phases = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-hidden-fold.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const hidden = page.locator('[data-transaction-id="txn_read0"][data-hidden-in-fold="true"]');
  await expect(hidden).toBeVisible();
  await expect(hidden).toHaveAttribute("aria-label", "Read_0 inside collapsed TimeGroup");
  await expect(page.locator('[data-transaction-row-id="txn_read0"]')).toContainText("25");
  await expect(page.locator('[data-transaction-row-id="txn_read0"]')).toContainText("35");
});

test("Bookmark inside a collapsed TimeGroup is identified in the Bookmarks panel", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }, { id: "fold-22-30", name: "Nested Fold", start: 22, end: 30, presentation: { collapsed: true } }];
  value.bookmarks = [{ id: "bookmark-inside-fold", name: "Hidden marker", start: 25 }];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "bookmark-hidden-fold.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
  await page.getByTestId("bookmark-row-bookmark-inside-fold").click();
  const marker = page.locator(".cycle-ruler [data-bookmark-id='bookmark-inside-fold']");
  await expect(marker).toHaveAttribute("data-inside-collapsed", "Fold");
  await expect(page.locator(".cycle-ruler [data-time-group-id='fold-20-40']")).toBeVisible();
  await marker.click({ force: true });
  await expect(page.getByTestId("bookmark-row-bookmark-inside-fold")).toHaveAttribute("data-selected", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator(".cycle-ruler [data-bookmark-id='bookmark-inside-fold']")).toHaveAttribute("data-source-cycle", "25");
  await expect(page.getByTestId("bookmark-row-bookmark-inside-fold")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("bookmark-inside-collapsed")).toContainText("Fold");
  await expect(page.getByTestId("bookmark-inside-collapsed")).toContainText("Nested Fold");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane [data-bookmark-id='bookmark-inside-fold']")).toHaveAttribute("data-source-cycle", "25");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator(".cycle-ruler [data-bookmark-id='bookmark-inside-fold']")).toHaveAttribute("data-source-cycle", "25");
  await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
  await page.getByTestId("bookmark-row-bookmark-inside-fold").click();
  const expandAndJump = page.getByTestId("bookmark-expand-and-jump");
  await expect(expandAndJump).toBeVisible();
  const host = page.getByTestId("cycle-surface");
  const beforeReveal = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeReveal.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeReveal.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(beforeReveal.dirty!);
  await expandAndJump.click();
  await expect(page.getByTestId("bookmark-inside-collapsed")).toBeHidden();
  await expect(page.locator(".transaction-axis-break-gap")).toHaveCount(0);
  await expect(page.getByTestId("bookmark-row-bookmark-inside-fold")).toContainText("25");
  await page.getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect(page.getByTestId("bookmark-inside-collapsed")).toContainText("Fold");
  await expect(page.getByTestId("bookmark-inside-collapsed")).toContainText("Nested Fold");
  await page.getByRole("button", { name: "Redo", exact: true }).last().click();
  await expect(page.getByTestId("bookmark-inside-collapsed")).toBeHidden();
});

test("Combined View keeps the shared fold visible in the Transaction pane", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.bookmarks = [{ id: "combined-bookmark", name: "Combined marker", start: 10 }];
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 10;
  transaction.end = 60;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "combined-fold.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await expect(page.locator(".split-transaction-pane .transaction-axis-break-gap").first()).toBeVisible();
  await expect(page.locator(".split-transaction-pane [data-transaction-id='txn_read0']")).toBeVisible();
  await page.locator(".split-transaction-pane .transaction-bookmark-markers [data-bookmark-id='combined-bookmark']").click();
  await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
  await expect(page.getByTestId("bookmark-row-combined-bookmark")).toHaveAttribute("data-selected", "true");
});

test("Transaction MiniMap marks collapsed source ranges without changing viewport policy", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "minimap-fold.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const minimap = page.getByTestId("minimap");
  await expect(minimap).toHaveAttribute("data-time-policy", "full-source-overview");
  await expect(minimap.getByTestId("minimap-fold-fold-20-40")).toBeVisible();
  await expect(minimap.getByTestId("minimap-viewport")).toBeVisible();
});

test("Range crossing a fold keeps source boundaries across Cycle and Transaction", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "range-fold.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const wave = page.getByTestId("cycle-surface").locator("[data-role='stable-waveform-surface']");
  const waveBox = await wave.boundingBox();
  const start = await page.getByTestId("cycle-ruler").locator("[data-source-cycle='10']").boundingBox();
  const end = await page.getByTestId("cycle-ruler").locator("[data-source-cycle='60']").boundingBox();
  expect(waveBox).not.toBeNull();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  await page.mouse.move(start!.x + 1, waveBox!.y + waveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + 1, waveBox!.y + waveBox!.height / 2);
  await page.mouse.up();
  const band = page.getByTestId("range-selection-band");
  await expect(band).toHaveAttribute("data-range-start", "10");
  await expect(band).toHaveAttribute("data-range-end", "60");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(band).toHaveAttribute("data-range-start", "10");
  await expect(band).toHaveAttribute("data-range-end", "60");
});

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction reference composition at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.getByRole("tab", { name: "Transaction", exact: true }).click();
    // Match the approved Reference's visible selection state before capturing
    // the region comparison: Read_0 is selected across the shared surfaces.
    await page.getByTestId("transaction-left-tree-row-txn_read0").click();

    await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Memory");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
    await expect(page.getByTestId("transaction-list-toolbar")).toContainText("Add");
    await expect(page.getByTestId("transaction-list-toolbar")).toContainText("Delete");
    await expect(page.getByTestId("transaction-list-search")).toBeVisible();
    await expect(page.getByTestId("delete-bottom-transaction")).toBeHidden();
    await expect(page.getByText(/^Editing:/)).toBeHidden();
    for (const heading of ["Name", "Group", "Lane", "Start Cycle", "End Cycle", "Duration (cycles)", "# Phases", "Linked Signals", "Color", "Description"]) {
      await expect(page.locator(".transaction-list-header-cells")).toContainText(heading);
    }
    await expect(page.locator(".inspector > .minimap .minimap-segment-transaction").first()).toBeVisible();
    await page.screenshot({ path: `test-results/transaction-composition-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}

test("Transaction canvas body and edge drags commit through the semantic command path", async ({ page }) => {
  page.on("console", (message) => { if (message.type() === "warning") console.log(message.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const bar = page.locator('[data-transaction-id="txn_read0"]');
  await bar.click();
  const inspector = page.getByTestId("inspector");
  const initialStart = await inspector.getByLabel("Transaction start").inputValue();
  const body = bar.locator(":scope > span").first();
  const bodyBox = await body.boundingBox();
  expect(bodyBox).not.toBeNull();
  await page.mouse.move(bodyBox!.x + bodyBox!.width / 2, bodyBox!.y + bodyBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bodyBox!.x + bodyBox!.width / 2 + 24, bodyBox!.y + bodyBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(inspector.getByLabel("Transaction start")).not.toHaveValue(initialStart);

  const startHandle = bar.locator(":scope > i[data-edge='start']");
  const startBox = await startHandle.boundingBox();
  expect(startBox).not.toBeNull();
  const beforeResize = await inspector.getByLabel("Transaction start").inputValue();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + 12, startBox!.y + startBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  // #551: an edge-attached first Phase follows a valid Transaction start resize.
  await expect(inspector.getByLabel("Transaction start")).not.toHaveValue(beforeResize);

  const endHandle = bar.locator(":scope > i[data-edge='end']");
  const endBox = await endHandle.boundingBox();
  expect(endBox).not.toBeNull();
  const beforeEndResize = await inspector.getByLabel("Transaction end").inputValue();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + 14, endBox!.y + endBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(inspector.getByLabel("Transaction end")).not.toHaveValue(beforeEndResize);
});

test("Transaction demo is available after a browser reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?transaction-demo");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("Memory");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Memory");
  await page.reload();
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
  await expect(page.locator(".transaction-list-header-cells")).toContainText("# Phases");
  await expect(page.locator(".transaction-list-header-cells")).toContainText("Linked Signals");
});

test("Fold, Bookmark, and Transaction source values survive Save/Open", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  value.bookmarks = [{ id: "bookmark-roundtrip", name: "Roundtrip", start: 25 }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 10;
  transaction.end = 60;
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fold-roundtrip.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(readFileSync(savedPath!, "utf8")) as any;
  expect(saved.timeGroups[0].presentation.collapsed).toBe(true);
  expect(saved.bookmarks[0].start).toBe(25);
  expect(saved.transactions.find((item: any) => item.id === "txn_read0")).toMatchObject({ start: 10, end: 60 });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
});

test("Moving a folded Transaction uses source-cycle geometry", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 10;
  transaction.end = 60;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fold-move.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const bar = page.locator('[data-transaction-id="txn_read0"]');
  const body = bar.locator(":scope > span").first();
  const box = await body.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 24, box!.y + box!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  const row = page.locator('[data-transaction-row-id="txn_read0"]');
  await expect(row).toContainText("50");
});

test("Resizing a folded Transaction preserves the opposite source boundary and undoes", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 10;
  transaction.end = 60;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fold-resize.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const bar = page.locator('[data-transaction-id="txn_read0"]');
  await bar.click();
  const inspector = page.getByTestId("inspector");
  const startHandle = bar.locator(":scope > i[data-edge='start']");
  const box = await startHandle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 18, box!.y + box!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(inspector.getByLabel("Transaction end")).toHaveValue("60");
  await expect(inspector.getByLabel("Transaction start")).not.toHaveValue("10");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(inspector.getByLabel("Transaction start")).toHaveValue("10");
});

test("Transaction starting inside a fold shows a start-hidden affordance", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 25;
  transaction.end = 60;
  transaction.phases = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fold-start-hidden.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const bar = page.locator('[data-transaction-id="txn_read0"]');
  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-fold-affordance="start-hidden"]')).toBeVisible();
});

test("Transaction ending inside a fold shows an end-hidden affordance", async ({ page }) => {
  const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
  value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
  const transaction = value.transactions.find((item: any) => item.id === "txn_read0");
  transaction.start = 10;
  transaction.end = 35;
  transaction.phases = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fold-end-hidden.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const bar = page.locator('[data-transaction-id="txn_read0"]');
  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-fold-affordance="end-hidden"]')).toBeVisible();
});

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Folded Transaction visual evidence at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const value = JSON.parse(readFileSync(samplePath, "utf8")) as any;
    value.timeGroups = [{ id: "fold-20-40", name: "Fold", start: 20, end: 40, presentation: { collapsed: true } }];
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fold-visual.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.locator(".transaction-axis-break-gap").first()).toBeVisible();
    await page.screenshot({ path: `test-results/folded-transaction-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}

test("Transaction sample is shown after reloading the default browser URL", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
  await page.reload();
  await expect(page.getByTestId("transaction-left-tree")).toContainText("All Transactions(6)");
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("Read_0");
});

test("Transaction Tree drag moves a transaction into another group", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const target = page.locator('[data-transaction-group-id="demo_tgrp_cpu"] .transaction-left-tree-group-header');
  await source.dragTo(target);
  await expect(page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_cpu"]')).toContainText("Read_0");
  await expect(page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_memory"]')).not.toContainText("Read_0");
});

test("Transaction Tree group drag is one undoable and redoable semantic operation", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const cpu = page.locator('[data-transaction-group-id="demo_tgrp_cpu"] .transaction-left-tree-group-header');
  const cpuGroup = page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_cpu"]');
  const memoryGroup = page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_memory"]');
  await source.dragTo(cpu);
  await expect(cpuGroup).toContainText("Read_0");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(memoryGroup).toContainText("Read_0");
  await expect(cpuGroup).not.toContainText("Read_0");
  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(cpuGroup).toContainText("Read_0");
  await expect(memoryGroup).not.toContainText("Read_0");
});

test("Transaction Tree group drag survives Save/Open", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const source = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  await source.dragTo(page.locator('[data-transaction-group-id="demo_tgrp_cpu"] .transaction-left-tree-group-header'));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(readFileSync(savedPath!, "utf8")) as { transactions: readonly { id: string; groupId?: string }[] };
  expect(saved.transactions.find((item) => item.id === "demo_txn_read")?.groupId).toBe("demo_tgrp_cpu");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(page.locator('.transaction-left-tree-group[data-transaction-group-id="demo_tgrp_cpu"]')).toContainText("Read_0");
});

test("Center additive selection projects to Tree and Bottom", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const read = page.locator('[data-transaction-id="demo_txn_read"]');
  const write = page.locator('[data-transaction-id="demo_txn_write"]');
  await read.click();
  await write.click({ modifiers: ["Control"] });
  await expect(read).toHaveAttribute("data-selected", "true");
  await expect(write).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_write")).toHaveAttribute("data-selected", "true");
  await expect(page.locator('.transaction-list-row[data-transaction-row-id="demo_txn_read"] > button')).toHaveAttribute("data-selected", "true");
  await expect(page.locator('.transaction-list-row[data-transaction-row-id="demo_txn_write"] > button')).toHaveAttribute("data-selected", "true");
});

test("focused Transaction Tree row supports Delete shortcut", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const row = page.getByTestId("transaction-left-tree-row-demo_txn_other");
  await row.focus();
  await row.press("Delete");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_other")).toHaveCount(0);
  await expect(page.locator('[data-transaction-id="demo_txn_other"]')).toHaveCount(0);
  await expect(page.locator('[data-transaction-row-id="demo_txn_other"]')).toHaveCount(0);
});
test("Transaction Tree Shift-click selects all visible children in a group", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const tree = page.getByTestId("transaction-left-tree");
  const group = tree.locator('[data-transaction-group-id="demo_tgrp_memory"] .transaction-left-tree-group-header');
  await group.click({ modifiers: ["Shift"] });
  await expect(tree.locator('[data-transaction-tree-id="demo_txn_read"]')).toHaveAttribute("data-selected", "true");
  await expect(tree.locator('[data-transaction-tree-id="demo_txn_write"]')).toHaveAttribute("data-selected", "true");
  await expect(tree.locator('[data-transaction-tree-id="demo_txn_fetch"]')).toHaveAttribute("data-selected", "false");
});

test("Transaction Tree group header supports left and right collapse navigation", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const group = page.locator('[data-transaction-group-id="demo_tgrp_memory"]');
  const toggle = group.locator(".transaction-left-tree-group-header > button").first();
  await toggle.focus();
  await toggle.press("ArrowLeft");
  await expect(group.locator('[data-transaction-tree-id="demo_txn_read"]')).toHaveCount(0);
  await toggle.press("ArrowRight");
  await expect(group.locator('[data-transaction-tree-id="demo_txn_read"]')).toHaveCount(1);
});

test("Transaction Tree Group menu shows and hides all child projections", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const group = page.locator('[data-transaction-group-id="demo_tgrp_memory"]');
  await group.locator(".transaction-left-tree-group-header .transaction-left-tree-more").click();
  await group.getByRole("menuitem", { name: "Hide All" }).click();
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(0);
  await expect(page.locator('[data-transaction-id="demo_txn_write"]')).toHaveCount(0);
  await group.locator(".transaction-left-tree-group-header .transaction-left-tree-more").click();
  await group.getByRole("menuitem", { name: "Show All" }).click();
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(1);
  await expect(page.locator('[data-transaction-id="demo_txn_write"]')).toHaveCount(1);
});

test("Transaction Tree Group menu selects all children", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const group = page.locator('[data-transaction-group-id="demo_tgrp_memory"]');
  await group.locator(".transaction-left-tree-group-header .transaction-left-tree-more").click();
  await group.getByRole("menuitem", { name: "Select Children" }).click();
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_write")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_fetch")).toHaveAttribute("data-selected", "false");
});
test("Transaction Tree visibility control hides only the selected transaction projection", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const row = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const visibility = row.locator("..").locator(".transaction-left-tree-visibility");
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(1);
  await visibility.click();
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(0);
  await expect(row).toHaveCount(1);
  await visibility.click();
  await expect(page.locator('[data-transaction-id="demo_txn_read"]')).toHaveCount(1);
});

test("focused Transaction Tree row supports F2 rename", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const row = page.getByTestId("transaction-left-tree-row-demo_txn_other");
  await row.focus();
  await row.press("F2");
  const input = page.getByRole("textbox", { name: "Rename Transaction2" });
  await input.fill("Renamed Transaction");
  await input.press("Enter");
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_other")).toContainText("Renamed Transaction");
});
