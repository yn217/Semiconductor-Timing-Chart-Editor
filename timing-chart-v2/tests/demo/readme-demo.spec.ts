import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

test("transaction-view", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  // The deterministic production startup showcase is authored by the application, not injected by the capture.
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  // Include a settled frame, but omit startup/loading from the public demo. Never trim failed UI actions.
  await page.waitForTimeout(500);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  await page.waitForTimeout(2500); // Deliberate reading pause, not a readiness workaround.
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]").filter({ hasText: "Address" }).first()).toBeVisible();
  await page.waitForTimeout(3000);
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await expect(page.locator(".split-signal-content")).toBeVisible();
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/transaction-view.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/transaction-view.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD, scenes: ["Cycle", "Transaction", "Combined"], errors,
  }, null, 2));
});

test("export", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.waitForTimeout(500);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  await page.waitForTimeout(1000);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(1500);
  await dialog.getByLabel("Export format").selectOption("png");
  await expect(dialog.getByLabel("PNG scale")).toBeVisible();
  await dialog.getByLabel("PNG scale").selectOption("2");
  await page.waitForTimeout(1500);
  await dialog.getByLabel("Export format").selectOption("pdf");
  await dialog.getByLabel("Export page size").selectOption("A4");
  await dialog.getByLabel("Export fit").selectOption("page");
  await page.waitForTimeout(1500);
  await dialog.getByLabel("Export format").selectOption("svg");
  await dialog.getByLabel("Export scope").selectOption("selected-range");
  await page.waitForTimeout(1000);
  await dialog.getByLabel("Export scope").selectOption("document");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.svg$/);
  const svg = await readFile((await file.path())!, "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("CLOCK");
  await expect(dialog.getByRole("status")).toHaveText("SVG ready");
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/export.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/export.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD, scenes: ["SVG", "PNG options", "PDF options", "Scope", "SVG download"], errors,
  }, null, 2));
});
