import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

/** Creates one Transaction via the Home Ribbon (canonical entry point) and
 * sets its exact start/end/name through the selected-Transaction editor. */
async function createTransaction(page: Page, name = "DMA Read", start = 2, end = 6) {
  const host = page.getByTestId("cycle-surface");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  // Create with the library's own placeholder defaults, then set the real
  // name/start/end through the selected-Transaction editor below -- #426
  // gave that editor's Apply a Draft/dirty gate (disabled when the draft
  // exactly matches canonical), so creating with the final values directly
  // would leave this second "set the exact values" edit as a no-op Apply
  // that never enables.
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  // Keep this acceptance suite on the same Transaction workspace owner as
  // the current production drag/export contract; Split View geometry has a
  // separate pane-relative coordinate surface.
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const lane = page.getByTestId("transaction-lanes");
  await lane.locator("[data-transaction-id]").first().click();
  const editor = page.locator(".inspector-shell");
  await editor.getByLabel("Transaction name").fill(name);
  await editor.getByLabel("Transaction end").fill(String(end));
  await editor.getByLabel("Transaction start").fill(String(start));
  await editor.getByTestId("apply-inspector-transaction").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
}

test("moves a whole Transaction by dragging its body to a snapped cycle with one history entry", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await createTransaction(page, "DMA Read", 2, 6);
  const historyBefore = await page.getByTestId("history-status").textContent();
  const lane = page.getByTestId("transaction-lanes");
  const transaction = lane.locator("[data-transaction-id]");
  const before = (await transaction.boundingBox())!;
  const cycle10 = (await page.getByTestId("cycle-ruler").locator("[data-cycle='10']").boundingBox())!;
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();
  const y = before.y + before.height / 2;
  await transaction.locator("span").hover();
  await page.mouse.down();
  await page.mouse.move(cycle10.x - 30, y);
  await page.mouse.move(cycle10.x - 10, y);
  await page.mouse.move(cycle10.x, y);
  await expect(transaction).toHaveAttribute("data-drag-preview", "true");
  const preview = (await transaction.boundingBox())!;
  expect(Math.abs(preview.x - before.x)).toBeGreaterThan(1);
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(dirtyBefore);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = (await transaction.boundingBox())!;
  expect(Math.abs(after.x - cycle10.x)).toBeLessThanOrEqual(2);
  expect(after.width).toBeCloseTo(before.width, 0);
  const historyAfter = await page.getByTestId("history-status").textContent();
  expect(historyAfter).not.toBe(historyBefore);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore!.replace("Redo 0", "Redo 1"));
  const undone = (await transaction.boundingBox())!;
  expect(Math.abs(undone.x - before.x)).toBeLessThanOrEqual(1);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const redone = (await transaction.boundingBox())!;
  expect(Math.abs(redone.x - cycle10.x)).toBeLessThanOrEqual(2);
});

test("keeps canonical state unchanged during a dense Transaction preview drag", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await createTransaction(page, "Dense preview", 2, 6);
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  const box = (await transaction.boundingBox())!;
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const countersBefore = JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
  const minimapBefore = await page.getByTestId("minimap").getAttribute("data-transaction-overview-builds");
  const diagnosticsBefore = await host.getAttribute("data-renderer-diagnostic-publishes");
  await page.getByTestId("home-snap-toggle").click();
  await expect(page.getByTestId("snap-status")).toHaveText("Snap: Off");
  await transaction.locator("span").hover();
  await page.mouse.down();
  for (let index = 0; index < 120; index += 1) await page.mouse.move(box.x + 20 + (index % 12), box.y + box.height / 2);
  await expect(transaction).toHaveAttribute("data-drag-preview", "true");
  expect(Number(await transaction.getAttribute("data-drag-pointer-moves"))).toBeGreaterThanOrEqual(120);
  expect(Number(await transaction.getAttribute("data-drag-preview-frames"))).toBeGreaterThan(0);
  expect(Number(await transaction.getAttribute("data-drag-preview-updates"))).toBeLessThanOrEqual(Number(await transaction.getAttribute("data-drag-preview-frames")));
  expect(Number(await transaction.getAttribute("data-drag-snap-queries"))).toBeGreaterThan(0);
  expect(await transaction.getAttribute("data-drag-snap-dom-queries")).toBe("0");
  expect(await transaction.getAttribute("data-drag-snap-layout-reads")).toBe("0");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(dirty);
  const countersDuring = JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
  expect(countersDuring.annotationResolvePasses).toBe(countersBefore.annotationResolvePasses);
  expect(countersDuring.edgeCounterResolvePasses).toBe(countersBefore.edgeCounterResolvePasses);
  expect(await page.getByTestId("minimap").getAttribute("data-transaction-overview-builds")).toBe(minimapBefore);
  expect(await host.getAttribute("data-renderer-diagnostic-publishes")).toBe(diagnosticsBefore);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
});

test("resizes a Transaction's start/end edge with snap and keeps start < end", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await createTransaction(page, "Resize target", 4, 8);
  const lane = page.getByTestId("transaction-lanes");
  const transaction = lane.locator("[data-transaction-id]");
  const before = (await transaction.boundingBox())!;
  const cycle2 = (await page.getByTestId("cycle-ruler").locator("[data-cycle='2']").boundingBox())!;
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();
  const y = before.y + before.height / 2;
  await transaction.locator("[data-edge='start']").hover();
  await page.mouse.down();
  await page.mouse.move(cycle2.x + cycle2.width / 2, y);
  await expect(transaction).toHaveAttribute("data-drag-preview", "true");
  expect((await transaction.boundingBox())!.width).toBeGreaterThan(before.width);
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(dirtyBefore);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const resized = (await transaction.boundingBox())!;
  expect(Math.abs(resized.x - cycle2.x)).toBeLessThanOrEqual(2);
  expect(resized.width).toBeGreaterThan(before.width);
});

test("clamps a Transaction edge drag at the terminal boundary and cannot cross the opposite edge", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await createTransaction(page, "Terminal clamp", 18, 22);
  const lane = page.getByTestId("transaction-lanes");
  const transaction = lane.locator("[data-transaction-id]");
  const before = (await transaction.boundingBox())!;
  const terminal = (await page.getByTestId("cycle-ruler").locator("[data-cycle='24']").boundingBox())!;
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();
  const y = before.y + before.height / 2;
  await transaction.locator("[data-edge='end']").hover();
  await page.mouse.down();
  await page.mouse.move(terminal.x + 30, y);
  await expect(transaction).toHaveAttribute("data-drag-preview", "true");
  expect((await transaction.boundingBox())!.width).toBeGreaterThan(before.width);
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(dirtyBefore);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const clamped = (await transaction.boundingBox())!;
  expect(Math.abs((clamped.x + clamped.width) - terminal.x)).toBeLessThanOrEqual(2);
});

test("Escape cancels an in-progress Transaction drag without any semantic mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await createTransaction(page, "Cancel me", 2, 6);
  const lane = page.getByTestId("transaction-lanes");
  const transaction = lane.locator("[data-transaction-id]");
  const before = (await transaction.boundingBox())!;
  const historyBefore = await page.getByTestId("history-status").textContent();
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const cycle10 = (await page.getByTestId("cycle-ruler").locator("[data-cycle='10']").boundingBox())!;
  const y = before.y + before.height / 2;
  await transaction.locator("span").hover();
  await page.mouse.down();
  await page.mouse.move(cycle10.x, y);
  await expect(transaction).toHaveAttribute("data-drag-preview", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  const after = (await transaction.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  await expect(transaction).toHaveAttribute("data-drag-preview", "false");
});

test("pointercancel discards a live Transaction preview without semantic mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await createTransaction(page, "Pointer cancel", 2, 6);
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  const before = (await transaction.boundingBox())!;
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const cycle10 = (await page.getByTestId("cycle-ruler").locator("[data-cycle='10']").boundingBox())!;
  await transaction.locator("span").hover();
  await page.mouse.down();
  await page.mouse.move(cycle10.x, before.y + before.height / 2);
  await expect(transaction).toHaveAttribute("data-drag-preview", "true");
  await transaction.dispatchEvent("pointercancel");
  await expect(transaction).toHaveAttribute("data-drag-preview", "false");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
  expect(Math.abs((await transaction.boundingBox())!.x - before.x)).toBeLessThanOrEqual(1);
  await page.mouse.up();
});

test("live drag keeps unrelated overlapping Transaction stack rows and positions stable", async ({ page }) => {
  await ready(page);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path.resolve(process.cwd(), "samples/acceptance-397/sample-a-basic-transaction-lifecycle.tcd.json"));
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const lane = page.getByTestId("transaction-lanes");
  const dragged = lane.locator("[data-transaction-id='txn_read0']");
  const stable = lane.locator("[data-transaction-id='txn_read1']");
  const stableBefore = await stable.boundingBox();
  const cycle10 = (await page.getByTestId("cycle-ruler").locator("[data-cycle='10']").boundingBox())!;
  const draggedBox = (await dragged.boundingBox())!;
  await dragged.locator("span").hover();
  await page.mouse.down();
  await page.mouse.move(cycle10.x, draggedBox.y + draggedBox.height / 2);
  await expect(dragged).toHaveAttribute("data-drag-preview", "true");
  const stableDuring = await stable.boundingBox();
  expect(stableDuring?.x).toBe(stableBefore?.x);
  expect(stableDuring?.y).toBe(stableBefore?.y);
  await expect(stable).toHaveAttribute("data-drag-preview", "false");
  await page.mouse.up();
});

test("Transaction context menu exposes only transaction-supported capabilities", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Context target", 2, 6);
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first();
  await transaction.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Transaction context menu" });
  await expect(menu).toBeVisible();
  for (const label of ["Copy", "Cut", "Duplicate", "Rename", "Delete"]) {
    await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeEnabled();
  }
  for (const label of ["Move Up", "Move Down"]) {
    await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeDisabled();
  }
  await expect(menu.getByRole("menuitem", { name: "Hide", exact: true })).toBeEnabled();
});

test("rejects a Transaction resize that would clip a Phase without changing history", async ({ page }) => {
  await ready(page);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path.resolve(process.cwd(), "samples/acceptance-429/sample-transaction-mode-closure.tcd.json"));
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id='txn_read0']");
  await expect(transaction).toBeVisible();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const box = (await transaction.boundingBox())!;
  const phaseBoundary = (await page.getByTestId("cycle-ruler").locator("[data-cycle='20']").boundingBox())!;
  await transaction.locator("[data-edge='start']").hover();
  await page.mouse.down();
  await page.mouse.move(phaseBoundary.x, box.y + box.height / 2);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await host.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await page.getByTestId("history-status").textContent()).toBe(beforeHistory);
});

test("rejects an End resize that would remove the final Phase", async ({ page }) => {
  await ready(page);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path.resolve(process.cwd(), "samples/acceptance-429/sample-transaction-mode-closure.tcd.json"));
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id='txn_read0']");
  await expect(transaction).toBeVisible();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const box = (await transaction.boundingBox())!;
  const phaseBoundary = (await page.getByTestId("cycle-ruler").locator("[data-cycle='50']").boundingBox())!;
  await transaction.locator("[data-edge='end']").hover();
  await page.mouse.down();
  await page.mouse.move(phaseBoundary.x, box.y + box.height / 2);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await host.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await page.getByTestId("history-status").textContent()).toBe(beforeHistory);
});

test("persists a valid Transaction resize and its Phases through Save/Open", async ({ page }) => {
  await ready(page);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path.resolve(process.cwd(), "samples/acceptance-429/sample-transaction-mode-closure.tcd.json"));
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id='txn_read0']");
  const before = (await transaction.boundingBox())!;
  const targetLocator = page.getByTestId("cycle-ruler").locator("[data-cycle='70']");
  const targetBeforeScroll = (await targetLocator.boundingBox())!;
  const viewport = page.getByTestId("cycle-viewport");
  await viewport.evaluate((element, targetX) => {
    element.scrollLeft = Math.max(0, targetX - element.clientWidth * 0.7);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, targetBeforeScroll.x);
  const target = (await targetLocator.boundingBox())!;
  await transaction.locator("[data-edge='end']").hover();
  await page.mouse.down();
  await page.mouse.move(target.x, before.y + before.height / 2);
  await page.mouse.up();
  await expect(page.locator(".transaction-list-row[data-transaction-row-id='txn_read0']")).toContainText("70");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.locator(".transaction-list-row[data-transaction-row-id='txn_read0']")).toContainText("70");
  await expect(page.locator(".transaction-list-row[data-transaction-row-id='txn_read0']")).toContainText("3");
});
