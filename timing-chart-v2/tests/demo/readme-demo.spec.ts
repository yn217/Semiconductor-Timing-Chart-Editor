import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { projectScenarioAsV2, type ScenarioId } from "@timing-chart-v2/schema";
import { canonicalDocumentOf, parseEditorDocument } from "../../apps/editor/src/file-document-controller.js";
import { annotationOwnerById, snapshotAnnotationIds, waitForCreatedAnnotationId } from "../e2e/annotation-identity.js";
import { documentState, expectViewOnly } from "../e2e/view-only.js";

test("hero-timing-chart", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  const mode = page.locator(".view-mode");
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");
  const host = page.getByTestId("cycle-surface");
  await mode.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  await tabs.getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  // New's production template supplies CLOCK/VALID/READY; do not inject a completed chart.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_valid']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("New event start").fill("10");
  await editor.getByLabel("New event value").selectOption("1");
  await page.waitForTimeout(700);
  await editor.getByTestId("add-signal-event").click();
  await expect(editor.locator("[data-event-start='10']")).toBeVisible();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.waitForTimeout(2200);
  const previousIds = await snapshotAnnotationIds(host);
  await tabs.getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByRole("button", { name: "Pick measurement endpoints", exact: true }).click();
  const ruler = page.getByTestId("cycle-ruler");
  for (const [id, cycle] of [["sig_cycle_request", 3], ["sig_cycle_ready", 5]] as const) {
    const row = await host.locator(`[data-role='timing-row'][data-row-id='${id}']`).boundingBox();
    const origin = await ruler.boundingBox();
    const x = await ruler.locator(`[data-source-cycle='${cycle}'][data-cycle]`).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
    expect(row && origin).toBeTruthy();
    await page.mouse.move(origin!.x + x, row!.y + row!.height / 2, { steps: 8 });
    await page.waitForTimeout(500);
    await page.mouse.down();
    await page.mouse.up();
  }
  const id = await waitForCreatedAnnotationId(host, previousIds, "measurement");
  await expect(annotationOwnerById(host, id)).toHaveAttribute("aria-label", /Δ 2 cycles/);
  await page.waitForTimeout(2500);
  await mode.getByRole("button", { name: "Transaction", exact: true }).click();
  const transactionEditor = page.getByTestId("transaction-editor");
  const end = transactionEditor.getByLabel("New Transaction end", { exact: true });
  const start = transactionEditor.getByLabel("New Transaction start", { exact: true });
  // The production input step expresses one source cycle in the active TC unit.
  const cycleInTc = Number(await end.getAttribute("step"));
  expect(cycleInTc).toBeGreaterThan(0);
  await transactionEditor.getByLabel("New Transaction name", { exact: true }).fill("Handshake");
  await end.fill(String(9 * cycleInTc));
  await start.fill(String(3 * cycleInTc));
  await transactionEditor.getByRole("button", { name: "Create Transaction", exact: true }).click();
  const bars = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  await expect(bars).toHaveCount(1);
  expect((await bars.boundingBox())!.width).toBeGreaterThan(0);
  expect(Number(await page.getByTestId("inspector").getByLabel("Transaction start", { exact: true }).inputValue()) / cycleInTc).toBeCloseTo(3, 10);
  expect(Number(await page.getByTestId("inspector").getByLabel("Transaction end", { exact: true }).inputValue()) / cycleInTc).toBeCloseTo(9, 10);
  await page.waitForTimeout(2000);
  await mode.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await expect(page.locator(".split-signal-content")).toBeVisible();
  await expect.poll(async () => (await bars.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  await page.waitForTimeout(3000);
  await tabs.getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(1200);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  expect(await readFile((await (await download).path())!, "utf8")).toContain("<svg");
  await expect(dialog.getByRole("status")).toHaveText("SVG ready");
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/hero-timing-chart.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/hero-timing-chart.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD,
    scenes: ["New production template", "VALID transition", "Measurement", "Create Transaction", "Combined", "Export SVG"], errors,
  }, null, 2));
});

test("scenario-compare", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const ribbon = page.getByTestId("ribbon");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await page.getByTestId("scenario-enable").click();
  const active = page.getByTestId("active-scenario");
  const a = await active.inputValue();
  await page.getByTestId("scenario-name").fill("Scenario A");
  await page.getByTestId("scenario-rename").click();
  await page.getByTestId("scenario-duplicate").click();
  const b = await active.inputValue();
  expect(b).not.toBe(a);
  await page.getByTestId("scenario-name").fill("Scenario B");
  await page.getByTestId("scenario-rename").click();
  const ready = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  await ready.click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("New event start").fill("7");
  await editor.getByLabel("New event value").selectOption("0");
  await editor.getByTestId("add-signal-event").click();
  await expect(editor.locator("[data-event-start='7']")).toBeVisible();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const before = await documentState(page);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  await page.waitForTimeout(1500);
  await active.selectOption(a);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expectViewOnly(page, before);
  await page.waitForTimeout(2000);
  await active.selectOption(b);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.waitForTimeout(1500);
  await page.getByTestId("scenario-compare-toggle").click();
  await expect(page.getByTestId("scenario-compare-target")).toHaveValue(a);
  const overlay = page.locator("[data-role='scenario-difference-overlay'][data-signal-id='sig_cycle_ready'][data-source-start='7']");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-source-end", "8");
  expect((await overlay.boundingBox())!.width).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  await page.getByTestId("scenario-difference-reveal-sig_cycle_ready-7").click();
  await expect(ready).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("range-selection-band")).toHaveAttribute("data-range-start", "7");
  await expect(page.getByTestId("range-selection-band")).toHaveAttribute("data-range-end", "8");
  await expectViewOnly(page, before);
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/scenario-compare.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/scenario-compare.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD,
    scenarioIds: [a, b], scenes: ["Scenario B", "Scenario A", "Compare READY Cycle 7", "Show in timeline"], errors,
  }, null, 2));
});

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

test("measurement", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.waitForTimeout(500);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Timebase frequency (Hz)").fill("100000000");
  await properties.getByLabel("Timebase display unit").selectOption("ns");
  await page.waitForTimeout(1500);
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const previousIds = await snapshotAnnotationIds(host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByRole("button", { name: "Pick measurement endpoints", exact: true }).click();
  const ruler = page.getByTestId("cycle-ruler");
  const pick = async (signalId: string, cycle: number) => {
    const row = await host.locator(`[data-role='timing-row'][data-row-id='${signalId}']`).boundingBox();
    const rulerBox = await ruler.boundingBox();
    const x = await ruler.locator(`[data-source-cycle='${cycle}'][data-cycle]`).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
    expect(row && rulerBox).toBeTruthy();
    await page.mouse.move(rulerBox!.x + x, row!.y + row!.height / 2, { steps: 8 });
    await page.waitForTimeout(800);
    await page.mouse.down();
    await page.mouse.up();
  };
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click from transition");
  await pick("sig_cycle_request", 3);
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click to transition");
  await pick("sig_cycle_ready", 5);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const annotationId = await waitForCreatedAnnotationId(host, previousIds, "measurement");
  const measurement = annotationOwnerById(host, annotationId);
  await expect(measurement).toBeVisible();
  await expect(measurement).toHaveAttribute("aria-label", /Δ 2 cycles \(20 ns\)/);
  await page.waitForTimeout(3000);
  await measurement.locator("[data-role='annotation-body']").click();
  await expect(page.getByTestId("inspector").getByTestId("annotation-editor")).toHaveAttribute("data-annotation-id", annotationId);
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/measurement.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/measurement.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD,
    scenes: ["Physical timebase 100 MHz", "REQUEST Cycle 3", "READY Cycle 5", "Delta 2 cycles / 20 ns", "Stable ID Inspector"], errors,
  }, null, 2));
});

test("annotation", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.waitForTimeout(500);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  const created: Array<{ id: string; type: string; label: string }> = [];
  for (const [type, signalId, start, end, label] of [
    ["arrow", "sig_cycle_request", 3, 6, "Request accepted"],
    ["range", "sig_cycle_valid", 6, 9, "Valid window"],
    ["callout", "sig_cycle_data", 7, 8, "Payload 0xA5"],
  ] as const) {
    await host.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    // Grow the end first so setting the start never creates an invalid draft range.
    await page.getByLabel("Timeline range end", { exact: true }).fill(String(end));
    await page.getByLabel("Timeline range start", { exact: true }).fill(String(start));
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
    await page.getByLabel("Annotation type").selectOption(type);
    const before = await snapshotAnnotationIds(host);
    await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    const id = await waitForCreatedAnnotationId(host, before, type);
    const owner = annotationOwnerById(host, id);
    await expect(owner).toBeVisible();
    const inspector = page.getByTestId("inspector");
    await expect(inspector.getByTestId("annotation-editor")).toHaveAttribute("data-annotation-id", id);
    await inspector.getByLabel("Annotation label", { exact: true }).fill(label);
    await inspector.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(owner).toHaveAttribute("aria-label", new RegExp(label));
    created.push({ id, type, label });
    await page.waitForTimeout(1200);
  }
  for (const { id } of created) await expect(annotationOwnerById(host, id)).toBeVisible();
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/annotation.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/annotation.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD,
    scenes: created.map(({ type, label }) => `${type}: ${label}`), errors,
  }, null, 2));
});

test("timeline-edit", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const ribbon = page.getByTestId("ribbon");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range end", { exact: true }).fill("6");
  await page.getByLabel("Timeline range start", { exact: true }).fill("5");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("callout");
  const previousIds = await snapshotAnnotationIds(host);
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  const id = await waitForCreatedAnnotationId(host, previousIds, "callout");
  const owner = annotationOwnerById(host, id);
  await expect(owner).toBeVisible();
  await page.getByTestId("inspector").getByLabel("Annotation label", { exact: true }).fill("Response edge");
  await page.getByTestId("inspector").getByRole("button", { name: "Apply", exact: true }).click();
  const save = async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const download = page.waitForEvent("download");
    await ribbon.getByRole("button", { name: "Save", exact: true }).click();
    const parsed = parseEditorDocument(await readFile((await (await download).path())!, "utf8"));
    if (!parsed.ok || parsed.kind !== "canonical") throw new Error("Expected saved canonical timeline demo.");
    return canonicalDocumentOf(parsed.document);
  };
  const before = await save();
  const body = owner.locator("[data-role='annotation-body']");
  const initialX = (await body.boundingBox())!.x;
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start", { exact: true }).fill("3");
  await page.getByLabel("Timeline range end", { exact: true }).fill("4");
  await page.getByLabel("Timeline insert count", { exact: true }).fill("2");
  await page.waitForTimeout(500);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  await page.waitForTimeout(2000);
  const historyBefore = Number((await page.getByTestId("history-status").textContent())!.match(/History (\d+)/)![1]);
  await ribbon.getByRole("button", { name: "Insert before", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-cycle-count", String(before.timeline.cycleCount + 2));
  await expect(page.getByTestId("history-status")).toHaveText(`History ${historyBefore + 1} / Redo 0`);
  expect((await body.boundingBox())!.x).toBeGreaterThan(initialX);
  await page.waitForTimeout(3000);
  await owner.locator("[data-role='annotation-body']").click();
  const anchor = page.getByTestId("inspector").getByLabel("Inspector annotation anchor cycle", { exact: true });
  await expect(anchor).toHaveValue("7");
  await page.waitForTimeout(1500);
  const after = await save();
  expect(after.annotations.find((annotation) => annotation.id === id)?.anchor?.cycle).toBe(7);
  for (const signalId of ["sig_cycle_request", "sig_cycle_ready"]) {
    const oldSignal = before.signals.find((signal) => signal.id === signalId)!;
    const newSignal = after.signals.find((signal) => signal.id === signalId)!;
    if (oldSignal.type !== "binary" || newSignal.type !== "binary") throw new Error("Expected binary transition fixture.");
    expect(newSignal.values).toEqual(oldSignal.values.map((value) => ({ ...value, start: value.start >= 3 ? value.start + 2 : value.start })));
  }
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/timeline-edit.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/timeline-edit.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", sourceHead: process.env.DEMO_SOURCE_HEAD,
    scenes: ["Insert two cycles before Cycle 3", "Transitions ripple", "Stable Annotation follows Cycle 5 → 7", "Save semantic verification"], errors,
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
