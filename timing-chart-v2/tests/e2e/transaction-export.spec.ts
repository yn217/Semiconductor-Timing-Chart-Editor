import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function createTransaction(page: Page, name = "DMA Read", start = 2, end = 6) {
  // The Home Ribbon's "Create Transaction" creates one immediately with
  // default name/start/end (the same one-click-with-defaults pattern every
  // other entity type's Ribbon create action uses), landing directly on its
  // edit form -- not an empty "New Transaction" form to fill in first.
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  const editor = page.getByTestId("transaction-editor");
  await editor.getByLabel("Transaction name", { exact: true }).fill(name);
  await editor.getByLabel("Transaction start", { exact: true }).fill(String(start));
  await editor.getByLabel("Transaction end", { exact: true }).fill(String(end));
  await editor.getByTestId("apply-transaction-properties").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  return editor;
}

async function linkSignal(inspector: import("@playwright/test").Locator, name: string) {
  await inspector.getByTestId("open-linked-signal-picker").click();
  await inspector.getByLabel("Search linked signals").fill(name);
  await inspector.getByRole("option", { name: new RegExp(name) }).click();
}

test("creates, edits, links, saves and reopens one canonical Transaction", async ({ page }) => {
  await ready(page);
  await createTransaction(page);
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Transaction name").fill("AXI Burst");
  await inspector.getByLabel("Transaction name").blur();
  await inspector.getByLabel("Transaction lane").fill("lane_1");
  // #454: General section's Description field -- same Draft/Apply gate
  // and full-replace-on-command semantics as Color/Group.
  await inspector.getByLabel("Transaction description").fill("AXI burst read across the shared bus");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await linkSignal(inspector, "REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(inspector.getByTestId("linked-signal-list").getByRole("button", { name: "Unlink REQUEST" })).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(inspector.getByTestId("linked-signal-list").getByRole("button", { name: "Unlink REQUEST" })).toHaveCount(1);
  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await save).path();
  await inspector.getByLabel("Transaction name").fill("Temporary"); await inspector.getByLabel("Transaction name").blur();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path!);
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction" }).click();
  await page.getByTestId("transaction-editor").getByRole("button", { name: /AXI Burst/ }).click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction name")).toHaveValue("AXI Burst");
  await expect(page.getByTestId("inspector").getByLabel("Transaction description")).toHaveValue("AXI burst read across the shared bus");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("shares source-time mapping, Snap Service, zoom and scroll in Split View", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Packet", 2, 5);
  const surface = page.getByTestId("cycle-surface").locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first();
  await expect(transaction).toBeVisible();
  const rulerCycle2 = page.getByTestId("cycle-ruler").locator("[data-cycle='2']");
  const transactionPane = page.locator(".split-transaction-pane");
  const signalPane = page.locator(".split-signal-content");
  const txBox = await transaction.boundingBox(); const tickBox = await rulerCycle2.boundingBox();
  const transactionPaneBox = await transactionPane.boundingBox(); const signalPaneBox = await signalPane.boundingBox();
  expect(Math.abs((txBox!.x - transactionPaneBox!.x) - (tickBox!.x - signalPaneBox!.x))).toBeLessThan(3);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => {
    const zoomTx = await transaction.boundingBox(); const zoomTick = await rulerCycle2.boundingBox();
    const zoomTransactionPaneBox = await transactionPane.boundingBox(); const zoomSignalPaneBox = await signalPane.boundingBox();
    return Math.abs((zoomTx!.x - zoomTransactionPaneBox!.x) - (zoomTick!.x - zoomSignalPaneBox!.x));
  }).toBeLessThan(3);
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = 180; element.dispatchEvent(new Event("scroll")); });
  await expect.poll(async () => {
    const scrollTx = await transaction.boundingBox(); const scrollTick = await rulerCycle2.boundingBox();
    const scrollTransactionPaneBox = await transactionPane.boundingBox(); const scrollSignalPaneBox = await signalPane.boundingBox();
    return Math.abs((scrollTx!.x - scrollTransactionPaneBox!.x) - (scrollTick!.x - scrollSignalPaneBox!.x));
  }).toBeLessThan(3);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});

test("exports both synchronized signal and transaction layers from Split View", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Split Export", 2, 6);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(page.getByTestId("cycle-surface")).toBeVisible();

  const surface = page.getByTestId("cycle-surface");
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    counters: await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG" }).click();
  const bytes = await (await pending).path();
  const svg = await readFile(bytes!);
  const text = svg.toString("utf8");

  expect(text).toContain('data-signal-id="sig_cycle_clock"');
  expect(text).toContain('data-transaction-id=');
  expect(text).toContain("Split Export");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(before.counters);
});

test("exports SVG, PNG and PDF from Split View through the shared ExportScene", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Split All Formats", 2, 6);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();

  const surface = page.getByTestId("cycle-surface");
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    counters: await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const download = async (format: "svg" | "png" | "pdf") => {
    await dialog.getByLabel("Export format").selectOption(format);
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}` }).click();
    return readFile((await (await pending).path())!);
  };

  const svg = await download("svg");
  const svgText = svg.toString("utf8");
  expect(svgText).toContain('data-signal-id="sig_cycle_clock"');
  expect(svgText).toContain('data-transaction-id=');
  expect(svgText).toContain("Split All Formats");
  const png = await download("png");
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const pdf = await download("pdf");
  expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1_000);

  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(before.counters);
});

test("preserves canonical Split View content through Save/Open", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Split Persisted", 2, 6);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  // #451: the same name now also appears in the Lane workspace's own Tree
  // rows (transaction-lane-label-row) alongside the central bar -- scope to
  // the bar specifically, since a plain getByText would ambiguously match
  // both by design.
  await expect(page.getByTestId("transaction-lanes").locator(".transaction-lane > button").getByText("Split Persisted")).toBeVisible();

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction" }).click();
  await page.getByTestId("transaction-editor").getByRole("button", { name: /Split Persisted/ }).click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction name")).toHaveValue("Split Persisted");
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("2");
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("6");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
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
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true })).toHaveCount(1);
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true })).toHaveCount(0);

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(panel).toHaveAttribute("data-view-mode", "Transaction");
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true })).toHaveCount(0);
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(panel).toHaveAttribute("data-view-mode", "Split");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(surface).toBeVisible();
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true })).toHaveCount(1);
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true })).toHaveCount(1);

  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await surface.getAttribute("data-session-counters")).toBe(before.counters);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Split View Home exposes command-backed Transaction actions", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  const home = page.getByTestId("ribbon");
  const transactionGroup = home.locator("[data-major-group='Transaction']");
  await expect(transactionGroup).toBeVisible();
  const surface = page.getByTestId("cycle-surface");
  await transactionGroup.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("transaction-lanes").locator("[data-transaction-id]").last().click();
  const beforeRevision = await surface.getAttribute("data-canonical-revision");
  await transactionGroup.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(2);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(String(Number(beforeRevision) + 1));
});

test("cross-highlights stable linked Signals when a Transaction is selected", async ({ page }) => {
  await ready(page);
  await createTransaction(page, "Linked Packet", 2, 6);
  const inspector = page.getByTestId("inspector");
  await linkSignal(inspector, "REQUEST");
  const historyBeforeSelection = await page.getByTestId("history-status").textContent();
  const surface = page.getByTestId("cycle-surface");
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    counters: await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };

  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByTestId("transaction-lanes").locator("[data-transaction-id]").last().click();
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
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first();
  const body = bar.locator("span").first();
  const bodyBox = await body.boundingBox();
  const cycle4 = await page.getByTestId("cycle-ruler").locator("[data-cycle='4']").boundingBox();
  await page.mouse.move(bodyBox!.x + bodyBox!.width / 2, bodyBox!.y + bodyBox!.height / 2); await page.mouse.down(); await page.mouse.move(cycle4!.x + 1, cycle4!.y + 10); await page.mouse.up();
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("4");
  const endHandle = bar.locator("[data-edge='end']");
  const handleBox = await endHandle.boundingBox(); const cycle10 = await page.getByTestId("cycle-ruler").locator("[data-cycle='10']").boundingBox();
  await page.mouse.move(handleBox!.x + 2, handleBox!.y + 8); await page.mouse.down(); await page.mouse.move(cycle10!.x + 1, cycle10!.y + 10); await page.mouse.up();
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("10");
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
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

test("exports canonical Header/Footer through browser SVG, PNG and PDF", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Document subtitle").fill("Browser export header");
  await properties.getByLabel("Footer figure number").fill("Fig. Browser");
  await properties.getByLabel("Footer revision").fill("R4");
  await properties.getByLabel("Footer text").fill("Export acceptance");
  await properties.getByTestId("apply-document-properties").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await properties.getByRole("button", { name: "Close properties" }).click();
  const surface = page.locator("[data-role='timing-chart-surface']");
  const before = { revision: await surface.getAttribute("data-canonical-revision"), history: await surface.getAttribute("data-history-depth"), counters: await surface.getAttribute("data-render-counters") };
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const download = async (format: "svg" | "png" | "pdf") => {
    await dialog.getByLabel("Export format").selectOption(format);
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}` }).click();
    return readFile((await (await pending).path())!);
  };
  const svg = (await download("svg")).toString("utf8");
  expect(svg).toContain("Browser export header");
  expect(svg).toContain("Fig. Browser · R4 · Export acceptance");
  const png = await download("png");
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(20)).toBeGreaterThan(250);
  const pdf = await download("pdf");
  expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1_000);
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await surface.getAttribute("data-render-counters")).toBe(before.counters);
});

test("keeps long document layout metadata through page-fit SVG, PNG and PDF export", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Document title").fill("Paged Timing Review");
  await properties.getByLabel("Document subtitle").fill("Long layout header");
  await properties.getByLabel("Document description").fill("A long document description that must remain outside the waveform width during page fitting.");
  await properties.getByLabel("Document notes").fill("Export notes remain visible in every page mode.");
  await properties.getByLabel("Document preconditions").fill("Clock is stable");
  await properties.getByLabel("Document constraints").fill("Setup must hold");
  await properties.getByLabel("Document exceptions").fill("Reset window");
  await properties.getByLabel("Footer figure number").fill("Fig. Page");
  await properties.getByLabel("Footer revision").fill("R5");
  await properties.getByLabel("Footer text").fill("Fit matrix");
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const download = async (format: "svg" | "png" | "pdf") => {
    await dialog.getByLabel("Export format").selectOption(format);
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}` }).click();
    return readFile((await (await pending).path())!);
  };
  await dialog.getByLabel("Export page size").selectOption("A4");
  await dialog.getByLabel("Export orientation").selectOption("portrait");
  await dialog.getByLabel("Export fit").selectOption("page");
  await dialog.getByLabel("Export margin").fill("32");
  const portraitSvg = (await download("svg")).toString("utf8");
  expect(portraitSvg).toContain('viewBox="0 0 794 1123"');
  expect(portraitSvg).toContain("A long document description that must remain outside the waveform width during page fitting.");
  expect(portraitSvg).toContain("Precondition: Clock is stable");
  expect(portraitSvg).toContain("Constraint: Setup must hold");
  expect(portraitSvg).toContain("Exception: Reset window");
  expect(portraitSvg).toContain("Fig. Page · R5 · Fit matrix");

  await dialog.getByLabel("Export orientation").selectOption("landscape");
  await dialog.getByLabel("Export fit").selectOption("width");
  const landscapeSvg = (await download("svg")).toString("utf8");
  expect(landscapeSvg).toMatch(/viewBox="0 0 1123 [0-9.]+"/);
  expect(Number(landscapeSvg.match(/viewBox="0 0 1123 ([0-9.]+)"/)?.[1])).toBeGreaterThan(300);
  expect(landscapeSvg).toContain("Long layout header");
  expect(landscapeSvg).toContain("Export notes remain visible in every page mode.");

  const png = await download("png");
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBeGreaterThan(500);
  expect(png.readUInt32BE(20)).toBeGreaterThan(300);
  const pdf = await download("pdf");
  expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1_000);
});

test("copies deterministic SVG and PNG through browser Clipboard export", async ({ page }) => {
  await ready(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
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
