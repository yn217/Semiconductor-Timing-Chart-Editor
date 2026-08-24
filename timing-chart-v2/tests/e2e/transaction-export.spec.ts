import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function createTransaction(page: Page, name = "DMA Read", start = 2, end = 6) {
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
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(inspector.getByLabel("Link REQUEST")).not.toBeChecked();
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(inspector.getByLabel("Link REQUEST")).toBeChecked();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await save).path();
  await inspector.getByLabel("Transaction name").fill("Temporary"); await inspector.getByLabel("Transaction name").blur();
  await page.locator("input[type='file']").setInputFiles(path!);
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

test("ripples Transaction ranges through Timeline edits with exact Undo", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Ripple", 2, 6);
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("4");
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("8");
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
  await createTransaction(page, "Exported DMA", 2, 6);
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
  expect(svgText).not.toMatch(/Ribbon|Inspector|selection-handle|snap-guide/);
  const png = await download("png"); expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const pdf = await download("pdf"); const pdf2 = await download("pdf"); expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-"); expect(pdf.length).toBeGreaterThan(1_000); expect(pdf).toEqual(pdf2);
});
