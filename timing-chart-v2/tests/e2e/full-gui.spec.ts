import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function createTextAnnotation(page: Page) {
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
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
  await expect(page.locator(".ribbon-group")).toHaveCount(5);
});

for (const route of ["Ribbon", "Keyboard", "Context Menu", "Inspector"] as const) {
  test(`routes Annotation delete through the shared command registry from ${route}`, async ({ page }) => {
    await ready(page);
    const owner = await createTextAnnotation(page);
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
  await inspector.getByLabel("Inspector signal name").blur();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='frozen-signal-name']")).toHaveText("REQUEST_EDITED");
  await inspector.getByLabel("Inspector signal visible").uncheck();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(0);
  await page.locator(".bottom-tabs").getByRole("button", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("No validation problems");
  await page.locator(".bottom-tabs").getByRole("button", { name: "JSON" }).click();
  await expect(page.getByTestId("json-panel")).toContainText('"formatVersion": 2');
  await page.getByTestId("json-panel").getByRole("button", { name: "Validate" }).click();
  await expect(page.getByTestId("json-panel")).toContainText("Valid");
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByTestId("inspector")).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
  await expect(page.getByTestId("bottom-editor")).toHaveCount(0);
});

test("saves and reopens through the application service boundary", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name");
  await name.fill("SAVED_REQUEST"); await name.blur();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await name.fill("TEMP_REQUEST"); await name.blur();
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
  await inspector.getByLabel("Edge Numbers show").check();
  await inspector.getByLabel("Edge Numbers mode").selectOption("both");
  await inspector.getByLabel("Edge Numbers every").fill("2");
  await inspector.getByRole("button", { name: "Apply Edge Numbers" }).click();
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
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});
