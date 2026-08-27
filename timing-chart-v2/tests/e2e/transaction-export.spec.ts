import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function createTransaction(page: Page, name = "DMA Read", start = 2, end = 6) {
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("button", { name: "Transaction" }).click();
  const editor = page.getByTestId("transaction-editor");
  await editor.getByLabel("New Transaction name").fill(name);
  await editor.getByLabel("New Transaction start").fill(String(start));
  await editor.getByLabel("New Transaction end").fill(String(end));
  await editor.getByRole("button", { name: "Create Transaction" }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  return editor;
}

test("creates, edits, links, saves and reopens one canonical Transaction", async ({ page }) => {
  await ready(page);
  await createTransaction(page);
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Transaction name").fill("AXI Burst");
  await inspector.getByLabel("Transaction name").blur();
  await inspector.getByLabel("Transaction lane").fill("lane_1");
  await inspector.getByRole("button", { name: "Apply Transaction" }).click();
  await inspector.getByLabel("Link REQUEST").check();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(inspector.getByLabel("Link REQUEST")).not.toBeChecked();
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(inspector.getByLabel("Link REQUEST")).toBeChecked();
  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await save).path();
  await inspector.getByLabel("Transaction name").fill("Temporary"); await inspector.getByLabel("Transaction name").blur();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path!);
  await page.locator(".bottom-tabs").getByRole("button", { name: "Transaction" }).click();
  await page.getByTestId("transaction-editor").getByRole("button", { name: /AXI Burst/ }).click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction name")).toHaveValue("AXI Burst");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("shares source-time mapping, Snap Service, zoom and scroll in Split View", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Packet", 2, 5);
  const surface = page.getByTestId("cycle-surface").locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  await expect(transaction).toBeVisible();
  const rulerCycle2 = page.getByTestId("cycle-ruler").locator("[data-cycle='2']");
  const txBox = await transaction.boundingBox(); const tickBox = await rulerCycle2.boundingBox();
  expect(Math.abs(txBox!.x - tickBox!.x)).toBeLessThan(3);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  const zoomTx = await transaction.boundingBox(); const zoomTick = await rulerCycle2.boundingBox();
  expect(Math.abs(zoomTx!.x - zoomTick!.x)).toBeLessThan(3);
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = 180; element.dispatchEvent(new Event("scroll")); });
  const scrollTx = await transaction.boundingBox(); const scrollTick = await rulerCycle2.boundingBox();
  expect(Math.abs(scrollTx!.x - scrollTick!.x)).toBeLessThan(3);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});

test("keeps the Split View surface contract and view mode changes view-only", async ({ page }) => {
  await ready(page);
  const panel = page.locator(".cycle-panel");
  const surface = page.getByTestId("cycle-surface");
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    counters: await surface.getAttribute("data-session-counters"),
  };

  await expect(panel).toHaveAttribute("data-view-mode", "Cycle");
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Signal", exact: true })).toHaveCount(1);
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(panel).toHaveAttribute("data-view-mode", "Transaction");
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Signal", exact: true })).toHaveCount(0);
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(panel).toHaveAttribute("data-view-mode", "Split");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(surface).toBeVisible();
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Signal", exact: true })).toHaveCount(1);
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true })).toHaveCount(1);

  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await surface.getAttribute("data-session-counters")).toBe(before.counters);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("cross-highlights stable linked Signals when a Transaction is selected", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Linked Packet", 2, 6);
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Link REQUEST").check();
  const historyBeforeSelection = await page.getByTestId("history-status").textContent();
  const surface = page.getByTestId("cycle-surface");
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    counters: await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByTestId("transaction-lanes").locator("[data-transaction-id]").click();
  const linkedRows = surface.locator("[data-row-id='sig_cycle_request'][data-transaction-linked='true']");
  await expect(linkedRows.first()).toBeVisible();
  expect(await linkedRows.count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeSelection ?? "");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(before.counters);

  await surface.locator("[data-row-id='sig_cycle_request']").first().click();
  await expect(surface.locator("[data-row-id='sig_cycle_request'][data-transaction-linked='true']")).toHaveCount(0);
});

test("ripples Transaction ranges through Timeline edits with exact Undo", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Ripple", 2, 6);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("4");
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("8");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("2");
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("6");
});

test("moves and resizes Transaction edges through the shared rendered-geometry Snap Service", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Snapped", 2, 6);
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  const body = bar.locator("span");
  const bodyBox = await body.boundingBox();
  const cycle4 = await page.getByTestId("cycle-ruler").locator("[data-cycle='4']").boundingBox();
  await page.mouse.move(bodyBox!.x + bodyBox!.width / 2, bodyBox!.y + bodyBox!.height / 2); await page.mouse.down(); await page.mouse.move(cycle4!.x + 1, cycle4!.y + 10); await page.mouse.up();
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("4");
  const endHandle = bar.locator("[data-edge='end']");
  const handleBox = await endHandle.boundingBox(); const cycle10 = await page.getByTestId("cycle-ruler").locator("[data-cycle='10']").boundingBox();
  await page.mouse.move(handleBox!.x + 2, handleBox!.y + 8); await page.mouse.down(); await page.mouse.move(cycle10!.x + 1, cycle10!.y + 10); await page.mouse.up();
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("10");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
});

test("exports deterministic SVG plus PNG and PDF from Canonical ExportScene", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector edge counter show").check();
  await inspector.getByLabel("Inspector edge counter mode").selectOption("both");
  await inspector.getByTestId("apply-inspector-edge-counter").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='clock-edge-number'][data-signal-id='sig_cycle_clock']")).not.toHaveCount(0);
  await createTransaction(page, "Exported DMA", 2, 6);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const download = async (format: "svg" | "png" | "pdf") => {
    await dialog.getByLabel("Export format").selectOption(format);
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}` }).click();
    const result = await pending; return readFile((await result.path())!);
  };
  const svg1 = await download("svg"); const svg2 = await download("svg");
  expect(svg1).toEqual(svg2);
  const svgText = svg1.toString("utf8");
  expect(svgText).toContain('data-transaction-id=');
  expect(svgText).toContain('data-signal-id="sig_cycle_state"');
  expect(svgText).toContain('data-wave-engine="wavedrom-3.6.2"');
  expect(svgText).toContain('data-layer="edge-counters"');
  expect(svgText).toContain('data-signal-id="sig_cycle_clock"');
  expect(svgText).not.toMatch(/Ribbon|Inspector|selection-handle|snap-guide/);
  const png = await download("png"); expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const pdf = await download("pdf"); const pdf2 = await download("pdf"); expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-"); expect(pdf.length).toBeGreaterThan(1_000); expect(pdf).toEqual(pdf2);
});

test("copies deterministic SVG and PNG through browser Clipboard export", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4198" });
  await ready(page);
  await createTransaction(page, "Clipboard DMA", 2, 6);
  const surface = page.getByTestId("cycle-surface");
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    counters: await surface.getAttribute("data-session-counters"),
  };
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });

  await dialog.getByRole("button", { name: "Copy SVG" }).click();
  await expect(dialog.locator("output")).toHaveText("SVG copied");
  const svgText = await page.evaluate(() => navigator.clipboard.readText());
  expect(svgText).toContain('data-export-scene="v2"');
  expect(svgText).toContain('data-wave-engine="wavedrom-3.6.2"');

  await dialog.getByRole("button", { name: "Copy PNG" }).click();
  await expect(dialog.locator("output")).toHaveText("PNG copied");
  const clipboardTypes = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.flatMap((item) => item.types);
  });
  expect(clipboardTypes).toContain("image/png");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await surface.getAttribute("data-session-counters")).toBe(before.counters);
});

test("Export dialog applies page and fit settings to the exported scene", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export page size").selectOption("A4");
  await dialog.getByLabel("Export orientation").selectOption("portrait");
  await dialog.getByLabel("Export fit").selectOption("page");
  await dialog.getByLabel("Export margin").fill("32");
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG" }).click();
  const download = await pending;
  const text = (await readFile((await download.path())!)).toString("utf8");
  expect(text).toContain('viewBox="0 0 794 1123"');
  expect(text).toContain('data-layer="page-content"');
});
