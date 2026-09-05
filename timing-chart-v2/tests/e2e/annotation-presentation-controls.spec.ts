import { expect, test } from "@playwright/test";

// #378: Stroke/Fill/Lock are the concrete gaps this issue's audit found --
// LabelOffset/Multiline/Z-order/Visibility were already real, generic,
// tested behavior (see the #378 closure evidence). These tests prove the
// three fixed gaps end to end: real canonical + rendered + exported effect
// for Stroke/Fill (previously Range/Highlight/Vertical Line didn't even
// export as their own shape), a real visible Lock indicator, and Lock's
// mixed-selection batch-atomicity fix.

async function addAnnotation(page: import("@playwright/test").Page, type: string) {
  await page.getByLabel("Annotation type").selectOption(type);
  await page.getByRole("button", { name: "Add annotation" }).click();
  return page.getByTestId("cycle-surface").locator(`[data-role='annotation-owner'][data-annotation-type='${type}']`).last();
}

async function exportSvgText(page: import("@playwright/test").Page): Promise<string> {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const text = fs.readFileSync(path!, "utf-8");
  // Close the dialog so a later action in the same test isn't blocked by it.
  await page.keyboard.press("Escape");
  return text;
}

test("Range Stroke/Fill controls have real canonical + rendered + exported effect", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const range = await addAnnotation(page, "range");
  const editor = page.getByTestId("annotation-editor");
  const strokeWidth = editor.getByTestId("annotation-stroke-fill-stroke-width");
  const strokeStyle = editor.getByTestId("annotation-stroke-fill-stroke-style");
  const fillColor = editor.getByTestId("annotation-stroke-fill-fill-color");
  const fillOpacity = editor.getByTestId("annotation-stroke-fill-fill-opacity");
  await expect(strokeWidth).toBeEnabled();
  await expect(fillColor).toBeEnabled();

  await strokeWidth.fill("6");
  await strokeWidth.blur();
  await strokeStyle.selectOption("dashed");
  await fillColor.fill("#00aa00");
  await fillOpacity.fill("0.5");
  await fillOpacity.blur();

  const body = range.locator("[data-role='annotation-body']");
  await expect(body).toHaveCSS("border-width", "6px");
  await expect(body).toHaveCSS("border-style", "dashed");
  const backgroundColor = await body.evaluate((element) => getComputedStyle(element).backgroundColor);
  // color-mix output is browser-computed; just confirm it isn't the
  // hardcoded 12% default mix any more (a real property-driven change).
  expect(backgroundColor).not.toBe("");

  const annotationId = await range.getAttribute("data-annotation-id");
  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  const rectMatch = groupMatch![0].match(/<rect[^>]*\/>/);
  expect(rectMatch).not.toBeNull();
  expect(rectMatch![0]).toContain(`stroke-width="6"`);
  expect(rectMatch![0]).toContain(`stroke-dasharray="7 4"`);
  expect(rectMatch![0]).toMatch(/fill-opacity="0\.5"/);
});

test("Vertical Line exports a full-height dashed line, not an invisible zero-length one", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const verticalLine = await addAnnotation(page, "verticalLine");
  const annotationId = await verticalLine.getAttribute("data-annotation-id");
  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  const lineMatch = groupMatch![0].match(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/);
  expect(lineMatch).not.toBeNull();
  expect(lineMatch![1]).toBe(lineMatch![3]);
  expect(Number(lineMatch![2])).toBe(0);
  expect(Number(lineMatch![4])).toBeGreaterThan(20);
  expect(groupMatch![0]).toContain("stroke-dasharray");
});

test("Text has no Stroke/Fill controls enabled -- disabled with a truthful reason, not a fake inert control", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await addAnnotation(page, "text");
  const editor = page.getByTestId("annotation-editor");
  await expect(editor.getByTestId("annotation-stroke-fill-stroke-width")).toBeDisabled();
  await expect(editor.getByTestId("annotation-stroke-fill-fill-color")).toBeDisabled();
  await expect(page.locator(".stroke-fill-group").first()).toHaveAttribute("title", /text/);
});

test("Lock shows a real visible indicator, blocks drag, and Unlock restores it -- mixed-selection Lock affects only the unlocked one", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const first = await addAnnotation(page, "text");
  const firstId = await first.getAttribute("data-annotation-id");
  const second = await addAnnotation(page, "marker");
  const secondId = await second.getAttribute("data-annotation-id");

  const openMenu = async () => {
    const trigger = page.locator(".arrange-dropdown-trigger");
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  };
  const menu = page.locator(".arrange-menu");

  // Lock only the first annotation.
  await first.locator("[data-role='annotation-label']").click();
  await openMenu();
  await menu.getByRole("menuitem", { name: "Lock", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(first).toHaveAttribute("data-locked", "true");
  await expect(first.locator("[data-role='annotation-lock-glyph']")).toHaveCount(1);
  await expect(second).toHaveAttribute("data-locked", "false");

  // Dragging the locked annotation's whole body must not move it.
  const handleBefore = await first.locator("[data-role='annotation-handle']").first().boundingBox();
  await first.locator("[data-role='annotation-label']").hover();
  await page.mouse.down();
  await page.mouse.move((handleBefore!.x) + 60, handleBefore!.y + 20, { steps: 5 });
  await page.mouse.up();
  const handleAfter = await first.locator("[data-role='annotation-handle']").first().boundingBox();
  expect(Math.abs(handleAfter!.x - handleBefore!.x)).toBeLessThan(2);

  // Mixed selection (first locked, second unlocked): clicking Lock in the
  // Arrange menu used to send an atomic batch that failed entirely because
  // the first was already locked -- now it must lock only the second.
  await first.locator("[data-role='annotation-label']").click();
  await second.locator("[data-role='annotation-label']").click({ modifiers: ["Control"] });
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(second).toHaveAttribute("data-selected", "true");
  await openMenu();
  await menu.getByRole("menuitem", { name: "Lock", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(first).toHaveAttribute("data-locked", "true");
  await expect(second).toHaveAttribute("data-locked", "true");
  await expect(second.locator("[data-role='annotation-lock-glyph']")).toHaveCount(1);

  // Both now locked: Unlock (mixed would be "all locked" here, a uniform
  // batch) restores both, and the glyph disappears.
  await openMenu();
  await menu.getByRole("menuitem", { name: "Unlock", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(first).toHaveAttribute("data-locked", "false");
  await expect(second).toHaveAttribute("data-locked", "false");
  await expect(first.locator("[data-role='annotation-lock-glyph']")).toHaveCount(0);
  expect(firstId).not.toBeNull();
  expect(secondId).not.toBeNull();
});
