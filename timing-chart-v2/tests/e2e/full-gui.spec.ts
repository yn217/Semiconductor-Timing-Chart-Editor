import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function createTextAnnotation(page: Page) {
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  return host.locator("[data-role='annotation-owner']").last();
}

test("matches the locked desktop pane geometry at the Golden viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const ribbon = await page.getByTestId("ribbon").boundingBox();
  const workspace = await page.locator(".desktop-workspace").boundingBox();
  const bottom = await page.getByTestId("bottom-editor").boundingBox();
  const inspector = await page.getByTestId("inspector").boundingBox();
  expect(ribbon).toMatchObject({ y: 70, height: 147 });
  expect(workspace).toMatchObject({ y: 217 });
  expect(bottom).toMatchObject({ x: 330, height: 270 });
  expect(inspector).toMatchObject({ x: 1372, width: 300 });
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Transaction" })).toHaveCount(1);
  await expect(page.locator(".ribbon-group")).toHaveCount(7);
});

for (const route of ["Ribbon", "Keyboard", "Context Menu", "Inspector"] as const) {
  test(`routes Annotation delete through the shared command registry from ${route}`, async ({ page }) => {
    await ready(page);
    const owner = await createTextAnnotation(page);
    if (route === "Ribbon" || route === "Keyboard" || route === "Context Menu" || route === "Inspector") await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    if (route === "Ribbon") await page.getByTestId("ribbon").getByRole("button", { name: "Delete", exact: true }).click();
    if (route === "Keyboard") { await owner.focus(); await owner.press("Delete"); }
    if (route === "Context Menu") { await owner.locator("[data-role='annotation-label']").click({ button: "right" }); await page.getByRole("menuitem", { name: "Delete" }).click(); }
    if (route === "Inspector") await page.getByTestId("inspector").getByRole("button", { name: "Delete Annotation" }).click();
    await expect(page.getByTestId("cycle-surface").locator("[data-role='annotation-owner']")).toHaveCount(0);
    await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("cycle-surface").locator("[data-role='annotation-owner']")).toHaveCount(1);
  });
}

test("applies Inspector drafts, exposes Problems/JSON, and toggles panels", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("REQUEST_EDITED");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='frozen-signal-name']")).toHaveText("REQUEST_EDITED");
  await inspector.getByLabel("Inspector signal visible").uncheck();
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(0);
  await page.locator(".bottom-tabs").getByRole("button", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("No validation problems");
  await page.locator(".bottom-tabs").getByRole("button", { name: "JSON" }).click();
  await expect(page.getByTestId("json-panel")).toContainText('"formatVersion": 2');
  await page.getByTestId("json-panel").getByRole("button", { name: "Validate" }).click();
  await expect(page.getByTestId("json-panel")).toContainText("Valid");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByTestId("inspector")).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
  await expect(page.getByTestId("bottom-editor")).toHaveCount(0);
});

test("applies Annotation Inspector drafts through one semantic command", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const owner = await createTextAnnotation(page);
  const inspector = page.getByTestId("inspector");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await inspector.getByLabel("Inspector annotation label").fill("Inspector Note");
  await inspector.getByLabel("Inspector annotation color").fill("#114477");
  await inspector.getByTestId("apply-inspector-annotation").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(inspector.getByLabel("Inspector annotation label")).toHaveValue("Inspector Note");
  await expect(owner.locator("[data-role='annotation-label']")).toHaveText("Inspector Note");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});

test("edits Header and Footer metadata through Document Properties and reopens it", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Document title").fill("Timing Review");
  await properties.getByLabel("Document subtitle").fill("Reviewed timing");
  await properties.getByLabel("Document constraints").fill("Setup must hold\nClock must be stable");
  await properties.getByLabel("Footer figure number").fill("Fig. 2");
  await properties.getByLabel("Footer revision").fill("R3");
  await properties.getByLabel("Footer text").fill("Internal review");
  await properties.getByTestId("apply-document-properties").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await properties.getByRole("button", { name: "Close properties" }).click();
  await expect(page.locator(".app-titlebar h1")).toHaveText("Timing Review");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.locator("input[type='file']").setInputFiles(path!);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Timing Review");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("exposes hierarchy paths, stable-ID reveal, and atomic bulk signal registration", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='left-tree-rows'] [data-row-id='sig_cycle_data']");
  await row.click();
  await expect(row).toHaveAttribute("data-full-path", "dut.data[7:0]");
  await expect(page.getByTestId("scope-breadcrumb")).toHaveText("Scope: dut");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  await page.getByTestId("reveal-in-hierarchy").click();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await page.getByTestId("bulk-register-open").click();
  await page.getByLabel("Bulk signal definitions").fill("dut.core.status binary\ndut.core.payload bus");
  await page.getByTestId("bulk-register-apply").click();
  await expect(host).toHaveAttribute("data-history-depth", "1");
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(host.locator("[data-role='left-tree-rows'] [data-full-path='dut.core.status']")).toHaveCount(1);
  await expect(host.locator("[data-role='left-tree-rows'] [data-full-path='dut.core.payload']")).toHaveCount(1);
});

test("View controls expose geometry-backed Grid/Snap and a pannable MiniMap viewport", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const grid = page.getByTestId("geometry-grid");
  await expect(grid).toHaveAttribute("data-grid-enabled", "true");
  await expect(grid.locator("[data-role='geometry-grid-line']")).toHaveCount(25);
  await page.getByTestId("grid-toggle").uncheck();
  await expect(grid).toHaveAttribute("data-grid-enabled", "false");
  await page.getByTestId("snap-toggle").uncheck();
  await expect(page.getByTestId("snap-toggle")).not.toBeChecked();
  const viewport = page.getByTestId("cycle-viewport");
  const before = await viewport.evaluate((element) => element.scrollTop);
  await page.getByTestId("minimap").click({ position: { x: 20, y: 55 } });
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
  await expect(page.getByTestId("minimap-viewport")).toBeVisible();
});

test("applies Signal Inspector capability fields as one semantic operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("DATA_RENAMED");
  await inspector.getByLabel("Inspector signal role").selectOption("output");
  await inspector.getByLabel("Inspector signal type").selectOption("bus");
  await inspector.getByLabel("Inspector signal width").fill("16");
  await inspector.getByLabel("Inspector bus format").selectOption("binary");
  await inspector.getByLabel("Inspector label align").selectOption("center");
  await inspector.getByLabel("Inspector label overflow").selectOption("wrap");
  await inspector.getByLabel("Inspector waveform row style").fill('{"color":"#114477"}');
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Inspector signal name")).toHaveValue("DATA_RENAMED");
  await expect(inspector.getByLabel("Inspector signal role")).toHaveValue("output");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("16");
  await expect(inspector.getByLabel("Inspector bus format")).toHaveValue("binary");
  await expect(inspector.getByLabel("Inspector label align")).toHaveValue("center");
  await expect(inspector.getByLabel("Inspector label overflow")).toHaveValue("wrap");
  await expect(inspector.getByLabel("Inspector waveform row style")).toHaveValue('{"color":"#114477"}');
});

test("applies Clock Generator Inspector drafts with editable duty and one history entry", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector clock start").fill("1");
  await inspector.getByLabel("Inspector clock period").fill("4");
  await inspector.getByLabel("Inspector clock duty").fill("0.25");
  await inspector.getByLabel("Inspector clock phase").fill("0.5");
  await inspector.getByLabel("Inspector clock initial").selectOption("1");
  await inspector.getByLabel("Inspector clock polarity").selectOption("negative");
  await inspector.getByTestId("apply-inspector-clock").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Inspector clock period")).toHaveValue("4");
  await expect(inspector.getByLabel("Inspector clock duty")).toHaveValue("0.25");
  await expect(inspector.getByLabel("Inspector clock polarity")).toHaveValue("negative");
});

test("edits a Comment Row through the dedicated Bottom Context Editor", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Comment Row", exact: true }).click();
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const commentRow = host.locator("[data-role='left-row'][data-kind='comment'][data-row-id]");
  await expect(commentRow).toHaveAttribute("data-kind", "comment");
  await commentRow.click();
  await expect(page.getByTestId("selection-status")).toContainText("Comment");
  const editor = page.getByTestId("comment-row-editor");
  await expect(editor).toBeVisible();
  const beforeRevision = Number(await host.getAttribute("data-canonical-revision"));
  await editor.getByLabel("Comment Row title").fill("Timing Note");
  await editor.getByLabel("Comment Row body").fill("Review boundary behavior at cycle 0.");
  await editor.getByTestId("apply-comment-row").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(beforeRevision + 1));
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(editor.getByLabel("Comment Row title")).toHaveValue("Timing Note");
  await expect(commentRow).toContainText("Timing Note");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.locator("input[type='file']").setInputFiles(path!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='left-row'][data-kind='comment'][data-row-id]")).toContainText("Timing Note");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("saves and reopens through the application service boundary", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name");
  await name.fill("SAVED_REQUEST"); await page.getByTestId("inspector").getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await name.fill("TEMP_REQUEST"); await page.getByTestId("inspector").getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator("input[type='file']").setInputFiles(path!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='frozen-signal-name']")).toHaveText("SAVED_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("renders Clock Edge Numbers from actual Geometry without WaveDrom regeneration", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector edge counter show").check();
  await inspector.getByLabel("Inspector edge counter mode").selectOption("both");
  await inspector.getByLabel("Inspector edge counter every").fill("2");
  await inspector.getByTestId("apply-inspector-edge-counter").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await host.locator("[data-role='clock-edge-number'][data-signal-id='sig_cycle_clock']").count()).toBeGreaterThan(5);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});

test("keeps global shortcuts focus-aware and IME-safe", async ({ page }) => {
  await ready(page);
  const owner = await createTextAnnotation(page);
  const annotationLabel = page.getByLabel("Annotation label", { exact: true });
  const initialLabel = await annotationLabel.inputValue();
  await annotationLabel.focus();
  await annotationLabel.fill("native-edit");
  await annotationLabel.press("Control+Z");
  await expect(annotationLabel).toHaveValue(initialLabel);
  await owner.focus();
  await owner.evaluate((element) => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, isComposing: true })));
  await expect(page.getByTestId("cycle-surface").locator("[data-role='annotation-owner']")).toHaveCount(1);
});

test("keeps view-only selection, tabs, zoom and panel state out of History and WaveDrom", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".bottom-tabs").getByRole("button", { name: "Problems" }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});
