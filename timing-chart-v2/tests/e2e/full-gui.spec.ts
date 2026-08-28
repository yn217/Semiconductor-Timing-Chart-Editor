import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Transaction" })).toHaveCount(0);
  await expect(page.locator(".ribbon-group")).toHaveCount(12);
});

test("keeps the V1 Home Ribbon dense without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const ribbon = page.getByTestId("ribbon");
  const metrics = await ribbon.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
    groupWidths: [...element.querySelectorAll<HTMLElement>(".ribbon-group")].map((group) => Math.round(group.getBoundingClientRect().width)),
  }));
  expect(metrics.height).toBe(147);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.groupWidths.length).toBe(12);
  await expect(page.locator(".app-titlebar")).toHaveCSS("height", "32px");
  await expect(page.locator(".ribbon-tabs")).toHaveCSS("height", "38px");
  await expect(page.locator(".status-bar")).toHaveCSS("height", "27px");
  await page.screenshot({ path: ".tmp_gui_reference/gui-batch-shell-dut-1672x941.png", animations: "disabled" });
});

test("Left Signal/Group rows expose V1 role and visibility controls through SemanticCommand", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='left-row'][data-row-id='sig_cycle_request']");
  await expect(row.locator("[data-role='tree-signal-role']")).toHaveText("i");
  await expect(row.locator("[data-role='tree-visibility']")).toBeVisible();
  await expect(row.locator("[data-role='tree-more']")).toBeVisible();
  const before = await page.getByTestId("history-status").textContent();
  await row.locator("[data-role='tree-visibility']").click();
  await expect(page.getByTestId("history-status")).not.toHaveText(before!);
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request'] [data-role='tree-visibility']")).toBeVisible();
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
});

test("Left Signal/Group filter is positioned in the V1 pane header and remains DOM-only", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const search = page.getByTestId("signal-tree-search-top");
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  await search.fill("ready");
  await expect(host.locator("[data-role='left-row'][data-name='READY']")).toBeVisible();
  await expect(host.locator("[data-role='left-row'][data-name='REQUEST']")).toBeHidden();
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await page.getByRole("button", { name: "Clear signal tree filter" }).click();
  await expect(host.locator("[data-role='left-row'][data-name='REQUEST']")).toBeVisible();
});

test("Left tree Add surface exposes real Signal/Clock/Bus/State/Group commands", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const add = page.getByRole("button", { name: "Add signal or group" });
  await add.click();
  const menu = page.getByRole("menu", { name: "Add signal or group" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["Signal", "Clock", "Bus", "State", "Group", "Comment Row"]);
  await page.screenshot({ path: ".tmp_gui_reference/gui-batch-tree-add-1280x720.png", animations: "disabled" });
  await menu.getByRole("menuitem", { name: "Bus", exact: true }).click();
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 9");
});

test("Group header chevron collapses derived rows without mutating Canonical or History", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const counters = await surface.getAttribute("data-render-counters");
  const control = host.locator("[data-role='left-row'][data-group-id='grp_cycle_control']");
  const controlHeader = host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']");
  await expect(host.locator("[data-role='left-group-header']")).toHaveCount(2);
  await expect(host.locator("[data-role='frozen-group-header']")).toHaveCount(2);
  await expect(host.locator("[data-role='timing-group-header']")).toHaveCount(2);
  await expect(controlHeader).toHaveAttribute("data-group-name", "Control");
  await page.screenshot({ path: ".tmp_gui_reference/gui-batch-group-headers-1672x941.png" });
  await expect(controlHeader).toBeVisible();
  await controlHeader.locator("[data-role='tree-collapse']").click();
  await expect(host).toHaveAttribute("data-collapsed-groups", "grp_cycle_control");
  await expect(control.first()).toBeVisible();
  await expect(host.locator("[data-role='left-row'][data-group-id='grp_cycle_control'][data-row-id='sig_cycle_request']")).toHaveAttribute("hidden", "");
  await expect(host.locator("[data-role='frozen-row'][data-group-id='grp_cycle_control'][data-row-id='sig_cycle_request']")).not.toHaveAttribute("hidden");
  await expect(host.locator("[data-role='timing-row'][data-group-id='grp_cycle_control'][data-row-id='sig_cycle_request']")).not.toHaveAttribute("hidden");
  await expect(host.locator("[data-role='wave-owner'][data-group-id='grp_cycle_control'][data-signal-id='sig_cycle_request']")).not.toHaveAttribute("hidden");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(surface).toHaveAttribute("data-render-counters", counters!);
  await controlHeader.locator("[data-role='tree-collapse']").click();
  await expect(host).toHaveAttribute("data-collapsed-groups", "");
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request']")).toBeVisible();
});

test("Inspector keeps the V1 sectioned editor geometry for a selected clock", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toHaveCSS("width", "300px");
  await expect(inspector.getByTestId("minimap")).toBeVisible();
  await expect(page.locator(".left-panel-tail").getByTestId("minimap")).toHaveCount(0);
  await expect(inspector.locator("header")).toContainText("Clock");
  await expect(inspector.locator("section")).toHaveCount(6);
  await expect(inspector.getByRole("heading", { name: "Clock Generator" })).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Edge Counter" })).toBeVisible();
  await expect(inspector.getByLabel("Inspector clock period")).toBeVisible();
  await expect(inspector.getByLabel("Inspector edge counter mode")).toBeVisible();
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(surface).toHaveAttribute("data-render-counters", /waveDromRenders/);
  await page.screenshot({ path: ".tmp_gui_reference/gui-batch-inspector-minimap-1672x941.png", animations: "disabled" });
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
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path!);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Timing Review");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pendingExport = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export SVG" }).click();
  const exported = await pendingExport;
  const exportedText = await readFile((await exported.path())!, "utf8");
  expect(exportedText).toContain("Timing Review");
  expect(exportedText).toContain("Reviewed timing");
  expect(exportedText).toContain("Fig. 2 · R3 · Internal review");
});

test("Save As downloads the canonical document with a requested filename without mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.getAttribute("data-render-counters"),
  };

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save As", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save As" });
  await dialog.getByLabel("Save As filename").fill("review-copy");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByTestId("save-as-submit").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("review-copy.tcd.json");
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  expect(await surface.getAttribute("data-render-counters")).toBe(before.counters);
});

test("edits and displays the Legend through the canonical presentation command", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Legend show").check();
  await properties.getByLabel("Legend orientation").selectOption("vertical");
  await properties.getByLabel("Legend used roles only").uncheck();
  await properties.getByTestId("apply-legend").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const legend = page.getByTestId("editor-legend");
  await expect(legend).toBeVisible();
  await expect(legend).toHaveClass(/vertical/);
  await expect(legend.locator("[data-legend-role]")).toHaveCount(3);
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
});

test("Legend editor exposes stable-ID label, visibility and ordering controls", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  const editor = properties.getByTestId("legend-entry-editor");
  const input = editor.locator("[data-legend-entry-id='legend_input']");
  await expect(editor.locator("[data-legend-entry-id]")).toHaveCount(3);
  await properties.getByLabel("Legend show").check();
  await input.getByLabel("Legend label legend_input").fill("Inputs");
  await input.getByLabel("Legend visibility legend_input").uncheck();
  await editor.locator("[data-legend-entry-id='legend_output']").getByRole("button", { name: "Move legend_output up" }).click();
  await properties.getByTestId("apply-legend").click();
  await expect(properties.getByTestId("legend-status")).toHaveText("Legend applied");
  await page.screenshot({ path: ".tmp_gui_reference/gui-batch-legend-editor-1280x720.png", fullPage: true });
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("editor-legend").locator("[data-legend-id='legend_input']")).toHaveCount(0);
  await expect(page.getByTestId("editor-legend").locator("[data-legend-id='legend_output']")).toHaveText(/output/);
});

test("edits Legend entry labels, visibility and order, then preserves them through Save/Open and export", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Legend show").check();
  await properties.getByLabel("Legend entries JSON").fill(JSON.stringify([
    { id: "legend_output", role: "output", label: "Outputs", visible: true, order: 0 },
    { id: "legend_input", role: "input", label: "Inputs", visible: false, order: 1 },
    { id: "legend_internal", role: "internal", label: "Core", visible: true, order: 2 },
  ], null, 2));
  await properties.getByTestId("apply-legend").click();
  await expect(properties.getByTestId("legend-status")).toHaveText("Legend applied");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const legend = page.getByTestId("editor-legend");
  await expect(legend.locator("[data-legend-id='legend_output']")).toHaveText(/Outputs/);
  await expect(legend.locator("[data-legend-id='legend_internal']")).toHaveText(/Core/);
  await expect(legend.locator("[data-legend-id='legend_input']")).toHaveCount(0);
  const save = page.waitForEvent("download");
  await properties.getByRole("button", { name: "Close properties" }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles((await (await save).path())!);
  await expect(page.getByTestId("editor-legend").locator("[data-legend-id='legend_output']")).toHaveText(/Outputs/);
  await expect(page.getByTestId("editor-legend").locator("[data-legend-id='legend_input']")).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pending = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export SVG" }).click();
  const exported = await readFile((await (await pending).path())!);
  expect(exported.toString("utf8")).toContain(">Outputs<");
  expect(exported.toString("utf8")).not.toContain(">input<");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
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
  await page.getByTestId("hierarchy-open").click();
  const hierarchy = page.getByTestId("hierarchy-browser");
  await expect(hierarchy).toBeVisible();
  await expect(hierarchy.locator("[data-hierarchy-row-id='sig_cycle_data']")).toContainText("dut.data[7:0]");
  await expect(hierarchy.locator("thead")).toContainText("Relative Path");
  await hierarchy.getByTestId("hierarchy-path-view").click();
  await expect(hierarchy.getByTestId("hierarchy-path-view")).toHaveAttribute("aria-pressed", "true");
  await hierarchy.getByLabel("Hierarchy scope").selectOption("dut");
  const scopedData = hierarchy.locator("[data-hierarchy-row-id='sig_cycle_data']");
  await expect(scopedData).toHaveCount(1);
  await expect(scopedData).toContainText("dut");
  await expect(scopedData).toContainText("data[7:0]");
  await hierarchy.getByLabel("Hierarchy scope").selectOption("all");
  await hierarchy.locator("[data-hierarchy-row-id='sig_cycle_data'] button").click();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await hierarchy.getByRole("button", { name: "Close hierarchy" }).click();
  await page.getByTestId("bulk-register-open").click();
  await page.getByLabel("Bulk signal definitions").fill("dut.core.status binary\ndut.core.payload bus");
  await page.getByTestId("bulk-register-apply").click();
  await expect(host).toHaveAttribute("data-history-depth", "1");
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(host.locator("[data-role='left-tree-rows'] [data-full-path='dut.core.status']")).toHaveCount(1);
  await expect(host.locator("[data-role='left-tree-rows'] [data-full-path='dut.core.payload']")).toHaveCount(1);

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = await save;
  const savedPath = await saved.path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='left-tree-rows'] [data-full-path='dut.core.status']")).toHaveCount(1);
  await expect(host.locator("[data-role='left-tree-rows'] [data-full-path='dut.core.payload']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("filters the Signal/Group tree by display name, path, role, or group without mutating the document", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const revisionBefore = await page.getByTestId("revision-status").textContent();
  const historyBefore = await page.getByTestId("history-status").textContent();
  const rendersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const filter = page.getByRole("textbox", { name: "Signal tree filter", exact: true });
  await filter.fill("ready");
  await expect(host).toHaveAttribute("data-tree-filter", "ready");
  await expect(host).toHaveAttribute("data-tree-filter-matches", "1");
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready']")).toBeVisible();
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request']")).toBeHidden();
  await filter.fill("output");
  await expect(host).toHaveAttribute("data-tree-filter-matches", "3");
  await expect(host.locator("[data-role='left-row'][data-signal-role='output']")).toHaveCount(3);
  await page.getByLabel("Clear signal tree filter").click();
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request']")).toBeVisible();
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  const rendersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(rendersAfter.waveDromRenders).toBe(rendersBefore.waveDromRenders);
  expect(rendersAfter.localGeometryBuilds).toBe(rendersBefore.localGeometryBuilds);
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

test("View controls expose functional Ruler and MiniMap visibility toggles without mutation", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>,
  };
  await page.getByTestId("ruler-toggle").uncheck();
  await page.getByTestId("minimap-toggle").uncheck();
  await expect(page.getByTestId("cycle-ruler")).toBeHidden();
  await expect(page.getByTestId("minimap")).toBeHidden();
  await page.screenshot({ path: ".tmp_gui_reference/gui-batch-view-toggles-1280x720.png", animations: "disabled" });
  await page.getByTestId("ruler-toggle").check();
  await page.getByTestId("minimap-toggle").check();
  await expect(page.getByTestId("cycle-ruler")).toBeVisible();
  await expect(page.getByTestId("minimap")).toBeVisible();
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.counters.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.counters.localGeometryBuilds);
});

test("MiniMap renders a derived waveform overview for every canonical row without mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    renders: await surface.getAttribute("data-render-counters"),
  };
  const minimap = page.getByTestId("inspector").getByTestId("minimap");
  await expect(minimap.locator("[data-row-id]")).toHaveCount(8);
  await expect(minimap.locator(".minimap-segment")).toHaveCount(21);
  await expect(minimap.locator(".minimap-segment-clock")).toHaveCount(1);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  expect(await surface.getAttribute("data-render-counters")).toBe(before.renders);
});

test("MiniMap viewport drag pans the real viewport without canonical or render mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const viewport = page.getByTestId("cycle-viewport");
  const minimap = page.getByTestId("minimap");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    scrollTop: await viewport.evaluate((element) => element.scrollTop),
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    counters: JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>,
  };
  const box = await minimap.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 3);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height - 3, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(before.scrollTop);
  await expect.poll(() => minimap.getAttribute("data-viewport-top")).not.toBe("0");
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.counters.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.counters.localGeometryBuilds);
});

test("Status Bar exposes derived selection, range, view and renderer state without mutating the document", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const status = page.locator(".status-bar");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  await expect(status).toContainText("Ready · Tool: Select");
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 8");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 0");
  await expect(page.getByTestId("range-status")).toHaveText("Range: [2, 4)");
  await expect(page.getByTestId("cycle-status")).toHaveText("Cycle 2");
  await expect(page.getByTestId("zoom-status-bar")).toHaveText("Zoom: 100%");
  await expect(page.getByTestId("snap-status")).toHaveText("Snap: On");
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await page.getByTestId("snap-toggle").uncheck();
  await expect(page.getByTestId("zoom-status-bar")).toHaveText("Zoom: 125%");
  await expect(page.getByTestId("snap-status")).toHaveText("Snap: Off");
  await page.locator(".view-mode").getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Split");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
});

test("Bottom Signal Context Editor keeps the V1 continuous center editing surface", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(bottom).toHaveCSS("grid-column-start", "2");
  await expect(bottom).toHaveCSS("grid-column-end", "auto");
  await expect(bottom.locator(".bottom-tabs")).toHaveCSS("height", "38px");
  await expect(bottom.getByTestId("signal-editor")).toBeVisible();
  await expect(bottom.getByTestId("signal-editor")).toContainText("REQUEST · binary");
  await expect(bottom.getByRole("table", { name: "Signal events" })).toBeVisible();
  await page.screenshot({ path: ".tmp_gui_reference/gui-batch-bottom-signal-1672x941.png", animations: "disabled" });
});

test("Fit Selection is a view-only navigation action backed by ruler geometry", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("50");
  await expect(page.getByTestId("zoom-status")).toHaveText("50%");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  const afterPreset = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterPreset.waveDromRenders).toBe(before.waveDromRenders);
  expect(afterPreset.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await page.getByLabel("Zoom preset").selectOption("100");
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit Selection", exact: true }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("200%");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect.poll(() => page.getByTestId("cycle-viewport").evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit All", exact: true }).click();
  await expect.poll(() => page.getByTestId("cycle-viewport").evaluate((element) => element.scrollLeft)).toBe(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  const afterFitAll = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterFitAll.waveDromRenders).toBe(after.waveDromRenders);
  expect(afterFitAll.localGeometryBuilds).toBe(after.localGeometryBuilds);
});

test("Canvas cycle selection exposes a ruler-geometry-backed playhead without mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const ruler = page.getByTestId("cycle-ruler");
  const before = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await ruler.locator("[data-cycle='6']").click();
  const playhead = ruler.getByTestId("playhead");
  await expect(playhead).toHaveAttribute("data-playhead-cycle", "6");
  await expect(page.getByTestId("selection-status")).toContainText("None");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  expect(await playhead.evaluate((element) => element.style.left)).toBe(await ruler.locator(".cycle-tick[data-cycle='6']").evaluate((element) => (element as HTMLElement).style.left));
  const after = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});

test("Canvas range drag supports reverse and Shift extension while Escape cancels preview", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveLayer = surface.locator("[data-role='stable-waveform-surface']");
  const waveBox = await waveLayer.boundingBox();
  const requestBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']").boundingBox();
  const ruler = page.getByTestId("cycle-ruler");
  const xAt = async (cycle: number) => Number.parseFloat(await ruler.locator(`[data-cycle='${cycle}']`).evaluate((element) => (element as HTMLElement).style.left));
  expect(waveBox && requestBox).toBeTruthy();
  const y = requestBox!.y + requestBox!.height / 2;
  const countersBefore = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as { snapIndexBuilds: number };

  await page.mouse.move(waveBox!.x + await xAt(7), y);
  await page.mouse.down();
  await page.mouse.move(waveBox!.x + await xAt(3), y);
  await expect(host).toHaveAttribute("data-range-drag", "active");
  await expect(host).toHaveAttribute("data-range-preview", "3:7");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const countersDuring = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as { snapIndexBuilds: number };
  expect(countersDuring.snapIndexBuilds - countersBefore.snapIndexBuilds).toBe(1);
  await page.mouse.up();
  await expect(host).not.toHaveAttribute("data-range-drag");
  await expect(page.getByTestId("range-status")).toHaveText("Range: [3, 7)");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.keyboard.down("Shift");
  await page.mouse.move(waveBox!.x + await xAt(7), y);
  await page.mouse.down();
  await page.mouse.move(waveBox!.x + await xAt(9), y);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("range-status")).toHaveText("Range: [3, 9)");

  await page.mouse.move(waveBox!.x + await xAt(5), y);
  await page.mouse.down();
  await page.mouse.move(waveBox!.x + await xAt(8), y);
  await expect(host).toHaveAttribute("data-range-drag", "active");
  const preview = page.getByTestId("range-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-range-start", "5");
  await expect(preview).toHaveAttribute("data-range-end", "8");
  expect((await preview.boundingBox())!.width).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(host).not.toHaveAttribute("data-range-drag");
  await expect(preview).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByTestId("range-status")).toHaveText("Range: [3, 9)");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Canvas keyboard navigation pans the viewport without canonical or render mutation", async ({ page }) => {
  await ready(page);
  const viewport = page.getByTestId("cycle-viewport");
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await viewport.focus();
  await viewport.press("End");
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const atEnd = await viewport.evaluate((element) => element.scrollLeft);
  await viewport.press("Home");
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(0);
  await viewport.press("PageDown");
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(atEnd).toBeGreaterThan(0);
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
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
  const before = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Inspector signal name")).toHaveValue("DATA_RENAMED");
  await expect(inspector.getByLabel("Inspector signal role")).toHaveValue("output");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("16");
  await expect(inspector.getByLabel("Inspector bus format")).toHaveValue("binary");
  await expect(inspector.getByLabel("Inspector label align")).toHaveValue("center");
  await expect(inspector.getByLabel("Inspector label overflow")).toHaveValue("wrap");
  const appliedStyle = JSON.parse(await inspector.getByLabel("Inspector waveform row style").inputValue()) as Record<string, unknown>;
  expect(appliedStyle.color).toBe("#114477");
  expect(appliedStyle.fontFamily).toBe("Segoe UI");
  expect(appliedStyle.fontSize).toBe(12);
  const styledRow = host.locator("[data-role='left-row'][data-row-id='sig_cycle_data']");
  await expect(styledRow).toHaveCSS("color", "rgb(17, 68, 119)");
  await expect(styledRow).toHaveCSS("text-align", "center");
  await expect(styledRow).toHaveCSS("white-space", "normal");
  const after = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBeGreaterThan(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBeGreaterThan(before.localGeometryBuilds);
  await inspector.getByLabel("Inspector waveform row style").fill('{"color":"#225588","fontWeight":"bold"}');
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(styledRow).toHaveCSS("color", "rgb(34, 85, 136)");
  await expect(styledRow).toHaveCSS("font-weight", "700");
  const afterStyleOnly = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterStyleOnly.waveDromRenders).toBe(after.waveDromRenders);
  expect(afterStyleOnly.localGeometryBuilds).toBe(after.localGeometryBuilds);
});

test("Signal Inspector properties survive Undo/Redo and Save/Open", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const signalRow = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']");
  await signalRow.click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("DATA_PERSISTED");
  await inspector.getByLabel("Inspector signal role").selectOption("output");
  await inspector.getByLabel("Inspector signal type").selectOption("bus");
  await inspector.getByLabel("Inspector signal width").fill("16");
  await inspector.getByLabel("Inspector bus format").selectOption("binary");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const savePromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await savePromise).path();
  expect(savedPath).toBeTruthy();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(inspector.getByLabel("Inspector signal name")).toHaveValue("DATA[7:0]");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(inspector.getByLabel("Inspector signal name")).toHaveValue("DATA_PERSISTED");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("16");

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await signalRow.click();
  await expect(inspector.getByLabel("Inspector signal name")).toHaveValue("DATA_PERSISTED");
  await expect(inspector.getByLabel("Inspector signal role")).toHaveValue("output");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("16");
  await expect(inspector.getByLabel("Inspector bus format")).toHaveValue("binary");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("applies Group Inspector presentation properties as one semantic operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector group name").fill("Control Group");
  await inspector.getByLabel("Group show background").check();
  await inspector.getByLabel("Group opacity").fill("0.8");
  await inspector.getByLabel("Group extend").selectOption("waveform");
  await inspector.getByTestId("apply-group-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Inspector group name")).toHaveValue("Control Group");
  await expect(host.locator("[data-role='timing-row'][data-group-id='grp_cycle_control']").first()).toHaveCSS("opacity", "0.8");
  await expect(host.locator("[data-role='timing-row'][data-group-id='grp_cycle_control']").first()).toHaveCSS("background-color", "rgb(238, 245, 252)");
});

test("applies Transaction Inspector phases through one semantic operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByLabel("New Transaction name").fill("Transfer");
  await page.getByLabel("New Transaction start").fill("2");
  await page.getByLabel("New Transaction end").fill("8");
  await page.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByTestId("inspector").getByLabel("Transaction phases").fill('[{"name":"Address","start":2,"end":4},{"name":"Data","start":4,"end":7}]');
  await page.getByTestId("inspector").getByTestId("apply-transaction-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByTestId("inspector").getByLabel("Transaction phases")).toHaveValue(/Address/);
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

test("Clock Inspector exposes common Signal Properties, hierarchy and style through one command", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByRole("heading", { name: "Signal Properties" })).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Source / Hierarchy" })).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Label Style" })).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Waveform / Timing" })).toBeVisible();
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await inspector.getByLabel("Inspector signal name").fill("clk_main");
  await inspector.getByLabel("Inspector signal role").selectOption("internal");
  await inspector.getByLabel("Inspector label align").selectOption("center");
  await inspector.getByTestId("apply-inspector-clock-properties").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Inspector signal name")).toHaveValue("clk_main");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
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
  await editor.getByLabel("Comment Row spacing after").fill("10");
  await editor.getByTestId("apply-comment-row").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(beforeRevision + 1));
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(editor.getByLabel("Comment Row title")).toHaveValue("Timing Note");
  await expect(editor.getByLabel("Comment Row spacing after")).toHaveValue("10");
  await expect(commentRow).toContainText("Timing Note");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='left-row'][data-kind='comment'][data-row-id]")).toContainText("Timing Note");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("renders Comment Row content at the shared cycle-0 canvas boundary", async ({ page }) => {
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const host = page.getByTestId("cycle-surface");
  const commentRow = host.locator("[data-role='left-row'][data-kind='comment'][data-row-id]").first();
  await commentRow.scrollIntoViewIfNeeded();
  const commentContent = host.locator("[data-role='timing-row'][data-kind='comment'] [data-role='comment-row-content']");
  await expect(commentContent).toHaveCount(3);
  await expect(commentContent.first()).toHaveAttribute("data-cycle", "0");
  const contentBox = await commentContent.first().boundingBox();
  const rowBox = await host.locator("[data-role='timing-row'][data-kind='comment']").first().boundingBox();
  const waveformBox = await host.locator("[data-role='wave-owner']").first().boundingBox();
  expect(contentBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  expect(waveformBox).not.toBeNull();
  expect(Math.abs(rowBox!.x - waveformBox!.x)).toBeLessThanOrEqual(1);
  expect(contentBox!.x).toBeGreaterThanOrEqual(rowBox!.x);
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
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path!);
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
  await inspector.getByLabel("Inspector edge counter count from").selectOption("visible-range-start");
  await inspector.getByTestId("apply-inspector-edge-counter").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await host.locator("[data-role='clock-edge-number'][data-signal-id='sig_cycle_clock']").count()).toBeGreaterThan(5);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await expect(host.locator("[data-role='clock-edge-number'][data-edge-counter-id*=':0']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = await downloadPromise;
  const savedPath = await saved.path();
  expect(savedPath).toBeTruthy();
  await inspector.getByLabel("Inspector edge counter count from").selectOption("signal-start");
  await inspector.getByTestId("apply-inspector-edge-counter").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  expect(await host.locator("[data-role='clock-edge-number'][data-signal-id='sig_cycle_clock']").count()).toBeGreaterThan(5);
  await expect(host.locator("[data-role='clock-edge-number'][data-edge-counter-id*=':0']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
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
  const sessionBefore = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as Record<string, number>;
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".bottom-tabs").getByRole("button", { name: "Problems" }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  const sessionAfter = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as Record<string, number>;
  expect(sessionAfter.validationRuns).toBe(sessionBefore.validationRuns);
  expect(sessionAfter.commits).toBe(sessionBefore.commits);
});
