import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { projectScenarioAsV2, type ScenarioId } from "@timing-chart-v2/schema";
import { canonicalDocumentOf, parseEditorDocument } from "../../apps/editor/src/file-document-controller.js";

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

test("quick-start", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.waitForTimeout(500);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Select All Signals", exact: true }).click();
  await ribbon.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "0");
  const add = async (kind: string) => {
    await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
    await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: kind, exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
  };
  await add("Group");
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector group name").fill("Handshake");
  await inspector.getByTestId("apply-group-properties").click();
  await page.waitForTimeout(800);
  await add("Clock");
  const rename = async (name: string) => {
    await inspector.getByLabel("Inspector signal name", { exact: true }).fill(name);
    await inspector.getByLabel("Inspector signal name", { exact: true }).press("Enter");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
  };
  await rename("CLOCK");
  await page.getByTestId("set-reference-clock").click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · CLOCK");
  await page.waitForTimeout(800);
  for (const [name, rise] of [["VALID", 2], ["READY", 3]] as const) {
    await add("Signal");
    await rename(name);
    const editor = page.getByTestId("signal-editor");
    for (const [start, value] of [[rise, "1"], [5, "0"]] as const) {
      await editor.getByLabel("New event start").fill(String(start));
      await editor.getByLabel("New event value").selectOption(value);
      await page.waitForTimeout(500);
      await editor.getByTestId("add-signal-event").click();
      await expect(editor.locator(`[data-event-start='${start}']`)).toBeVisible();
      await expect(host).toHaveAttribute("data-editor-idle", "true");
    }
    await page.waitForTimeout(800);
  }
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "3");
  for (const name of ["CLOCK", "VALID", "READY"]) {
    const row = host.locator("[data-role='frozen-row']").filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toHaveCount(1);
    const id = await row.getAttribute("data-row-id");
    const wave = host.locator(`[data-role='wave-owner'][data-signal-id='${id}'] svg`);
    await expect(wave).toBeVisible();
    await expect.poll(async () => (await wave.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  }
  await page.waitForTimeout(2000);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toMatch(/\.(json|tcd)$/);
  const parsed = parseEditorDocument(await readFile((await saved.path())!, "utf8"));
  if (!parsed.ok) throw new Error("Quick Start save did not produce a valid production document.");
  const document = parsed.kind === "canonical" ? canonicalDocumentOf(parsed.document)
    : projectScenarioAsV2(parsed.model, await page.getByTestId("active-scenario").inputValue() as ScenarioId);
  expect(document.signals.map((signal) => signal.name).sort()).toEqual(["CLOCK", "READY", "VALID"]);
  for (const [name, rise] of [["VALID", 2], ["READY", 3]] as const) {
    const signal = document.signals.find((candidate) => candidate.name === name);
    expect(signal?.type).toBe("binary");
    if (!signal || signal.type !== "binary") throw new Error(`Expected binary ${name}`);
    expect(signal.values.map(({ start, value }) => ({ start, value }))).toEqual([
      { start: 0, value: 0 }, { start: rise, value: "1" }, { start: 5, value: "0" },
    ]);
  }
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/quick-start.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/quick-start.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD,
    scenes: ["New", "Clear default signals", "Group", "Clock", "VALID transitions", "READY transitions", "Save"], errors,
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
