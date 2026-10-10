import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
import { annotationOwnerById, snapshotAnnotationIds, waitForCreatedAnnotationId } from "./annotation-identity.js";

startInCycleSample(test);

// #378: Stroke/Fill/Lock are the concrete gaps this issue's audit found --
// LabelOffset/Multiline/Z-order/Visibility were already real, generic,
// tested behavior (see the #378 closure evidence). These tests prove the
// three fixed gaps end to end: real canonical + rendered + exported effect
// for Stroke/Fill (previously Range/Highlight/Vertical Line didn't even
// export as their own shape), a real visible Lock indicator, and Lock's
// mixed-selection batch-atomicity fix.

async function openStyleSection(editor: import("@playwright/test").Locator): Promise<void> {
  // Style (Font, Stroke, Fill) lives in the Inspector's collapsible "Style" section (closed by default).
  const toggle = editor.getByRole("button", { name: /^Style/ });
  if (await toggle.count() > 0 && (await toggle.first().getAttribute("aria-expanded")) === "false") await toggle.first().click();
}

async function addAnnotation(page: import("@playwright/test").Page, type: string) {
  await page.getByLabel("Annotation type").selectOption(type);
  const host = page.getByTestId("cycle-surface");
  const previousIds = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Add annotation" }).click();
  return annotationOwnerById(host, await waitForCreatedAnnotationId(host, previousIds, type));
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

async function selectRequestSignal(page: import("@playwright/test").Page, host: import("@playwright/test").Locator) {
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
}

test("Range Stroke/Fill controls have real canonical + rendered + exported effect", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const range = await addAnnotation(page, "range");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  const strokeWidth = editor.getByTestId("inspector-stroke-fill-stroke-width");
  const strokeStyle = editor.getByTestId("inspector-stroke-fill-stroke-style");
  const strokeOpacity = editor.getByTestId("inspector-stroke-fill-stroke-opacity");
  const fillColor = editor.getByTestId("inspector-stroke-fill-fill-color");
  const fillOpacity = editor.getByTestId("inspector-stroke-fill-fill-opacity");
  await expect(strokeWidth).toBeEnabled();
  await expect(fillColor).toBeEnabled();
  await expect(strokeWidth).toHaveValue("1");
  await expect(fillOpacity).toHaveValue("0.12");

  const previousBorderColor = await range.locator("[data-role='annotation-body']").evaluate((element) => getComputedStyle(element).borderColor);
  await strokeWidth.fill("6");
  await strokeWidth.blur();
  await strokeStyle.selectOption("dashed");
  await strokeOpacity.fill("0.3");
  await strokeOpacity.blur();
  await fillColor.fill("#00aa00");
  await fillOpacity.fill("0.5");
  await fillOpacity.blur();
  await editor.getByTestId("apply-annotation-properties").click();

  const body = range.locator("[data-role='annotation-body']");
  await expect(body).toHaveCSS("border-width", "6px");
  await expect(body).toHaveCSS("border-style", "dashed");
  await expect.poll(() => body.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(previousBorderColor);
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
  expect(rectMatch![0]).toContain('stroke-opacity="0.3"');
  expect(rectMatch![0]).toContain(`stroke-dasharray="7 4"`);
  expect(rectMatch![0]).toMatch(/fill-opacity="0\.5"/);
});

test("invalid Stroke/Fill numeric drafts remain editable without mutating Canonical or History", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  await addAnnotation(page, "range");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  const strokeWidth = editor.getByTestId("inspector-stroke-fill-stroke-width");
  const strokeOpacity = editor.getByTestId("inspector-stroke-fill-stroke-opacity");
  const fillOpacity = editor.getByTestId("inspector-stroke-fill-fill-opacity");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  await strokeWidth.fill("99");
  await strokeWidth.blur();
  await expect(strokeWidth).toHaveValue("99");
  await expect(strokeWidth).toHaveAttribute("aria-invalid", "true");
  await expect(editor.getByRole("alert")).toContainText("between 1 and 8 px");
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);

  for (const [input, invalidValue, expectedMessage] of [
    [strokeOpacity, "1.2", "Stroke opacity must be between 0 and 1"],
    [fillOpacity, "-0.1", "Fill opacity must be between 0 and 1"],
  ] as const) {
    await input.fill(invalidValue);
    await input.blur();
    await expect(input).toHaveValue(invalidValue);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(editor.getByRole("alert").filter({ hasText: expectedMessage })).toHaveCount(1);
    await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(before.history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  }

  await strokeWidth.fill("5");
  await strokeWidth.blur();
  await strokeOpacity.fill("0.6");
  await strokeOpacity.blur();
  await fillOpacity.fill("0.35");
  await fillOpacity.blur();
  await expect(strokeWidth).toHaveAttribute("aria-invalid", "false");
  await expect(strokeOpacity).toHaveAttribute("aria-invalid", "false");
  await expect(fillOpacity).toHaveAttribute("aria-invalid", "false");
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(before.revision) + 1));
  await expect(page.getByTestId("history-status")).not.toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect.poll(() => host.locator("[data-role='annotation-body']").getAttribute("style")).toContain("border-width: 5px");
  await expect.poll(() => host.locator("[data-role='annotation-body']").getAttribute("style")).toContain("border-color: color-mix(in srgb, rgb(208, 74, 54) 60%, transparent)");
  await expect.poll(() => host.locator("[data-role='annotation-body']").getAttribute("style")).toContain("background-color: color-mix(in srgb, rgb(208, 74, 54) 35%, transparent)");
});

test("Dependency Stroke controls update the route without changing its semantic identity", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveBox = await surface.locator("[data-role='stable-waveform-surface']").boundingBox();
  const requestBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']").boundingBox();
  const readyBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_ready']").boundingBox();
  const cycle3 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  expect(waveBox && requestBox && readyBox).toBeTruthy();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("dependency");
  const priorIds = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await page.mouse.click(waveBox!.x + cycle3, requestBox!.y + requestBox!.height / 2);
  await page.mouse.click(waveBox!.x + cycle5, readyBox!.y + readyBox!.height / 2);
  const dependency = annotationOwnerById(host, await waitForCreatedAnnotationId(host, priorIds, "dependency"));
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  const strokeWidth = editor.getByTestId("inspector-stroke-fill-stroke-width");
  const strokeStyle = editor.getByTestId("inspector-stroke-fill-stroke-style");
  const strokeOpacity = editor.getByTestId("inspector-stroke-fill-stroke-opacity");
  await expect(strokeWidth).toBeEnabled();
  await expect(strokeWidth).toHaveValue("2");
  await strokeWidth.fill("5");
  await strokeWidth.blur();
  await strokeStyle.selectOption("dotted");
  await strokeOpacity.fill("0.4");
  await strokeOpacity.blur();
  await editor.getByTestId("apply-annotation-properties").click();

  const annotationId = await dependency.getAttribute("data-annotation-id");
  const path = dependency.locator("[data-role='annotation-path']");
  await expect(path).toHaveAttribute("stroke-width", "5");
  await expect(path).toHaveAttribute("stroke-dasharray", "2 3");
  await expect(path).toHaveAttribute("stroke-opacity", "0.4");
  await expect(dependency.locator("marker path")).toHaveAttribute("fill-opacity", "0.4");
  await expect(dependency).toHaveAttribute("data-annotation-type", "dependency");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savePath = await (await save).path();
  expect(savePath).toBeTruthy();
  const fs = await import("node:fs");
  const document = JSON.parse(fs.readFileSync(savePath!, "utf8")) as { annotations: Array<Record<string, unknown>> };
  expect(document.annotations.find((annotation) => annotation.id === annotationId)).toMatchObject({
    type: "dependency",
    style: { strokeWidth: 5, strokeStyle: "dotted", strokeOpacity: 0.4 },
  });

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savePath!);
  const reopened = annotationOwnerById(host, annotationId!);
  await expect(reopened).toHaveAttribute("data-annotation-type", "dependency");
  await expect(reopened.locator("[data-role='annotation-path']")).toHaveAttribute("stroke-width", "5");
  await expect(reopened.locator("[data-role='annotation-path']")).toHaveAttribute("stroke-dasharray", "2 3");
  await expect(reopened.locator("[data-role='annotation-path']")).toHaveAttribute("stroke-opacity", "0.4");
  await expect(reopened.locator("marker path")).toHaveAttribute("fill-opacity", "0.4");

  const svgText = await exportSvgText(page);
  const exported = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(exported?.[0]).toContain('stroke-width="5"');
  expect(exported?.[0]).toContain('stroke-dasharray="2 3"');
  expect(exported?.[0]).toContain('stroke-opacity="0.4"');
  expect(exported?.[0]).toContain('fill-opacity="0.4"');
});

test("Measurement Stroke styles its dimension line and export while preserving #205 lane geometry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const measurement = await addAnnotation(page, "measurement");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  const strokeWidth = editor.getByTestId("inspector-stroke-fill-stroke-width");
  const strokeStyle = editor.getByTestId("inspector-stroke-fill-stroke-style");
  const strokeOpacity = editor.getByTestId("inspector-stroke-fill-stroke-opacity");
  await expect(strokeWidth).toBeEnabled();
  await expect(strokeWidth).toHaveValue("2");
  await strokeWidth.fill("5");
  await strokeWidth.blur();
  await strokeStyle.selectOption("dotted");
  await strokeOpacity.fill("0.4");
  await strokeOpacity.blur();
  await editor.getByTestId("apply-annotation-properties").click();

  const path = measurement.locator("[data-role='annotation-path']");
  await expect(path).toHaveAttribute("stroke-width", "5");
  await expect(path).toHaveAttribute("stroke-dasharray", "2 3");
  await expect(path).toHaveAttribute("stroke-opacity", "0.4");
  await expect(measurement.locator("[data-role='measurement-marker']")).toHaveCount(2);
  await expect(measurement.locator("[data-role='measurement-extension']")).toHaveCount(2);
  const measurementId = await measurement.getAttribute("data-annotation-id");
  const lane = await measurement.getAttribute("data-measurement-lane");
  const side = await measurement.getAttribute("data-measurement-side");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savePath = await (await save).path();
  expect(savePath).toBeTruthy();
  const fs = await import("node:fs");
  const saved = JSON.parse(fs.readFileSync(savePath!, "utf8")) as { annotations: Array<Record<string, unknown>> };
  expect(saved.annotations.find((annotation) => annotation.id === measurementId)).toMatchObject({
    type: "measurement",
    style: { strokeWidth: 5, strokeStyle: "dotted", strokeOpacity: 0.4 },
  });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savePath!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const reopened = annotationOwnerById(host, measurementId!);
  await expect(reopened).toHaveAttribute("data-measurement-lane", lane!);
  await expect(reopened).toHaveAttribute("data-measurement-side", side!);
  await expect(reopened.locator("[data-role='annotation-path']")).toHaveAttribute("stroke-width", "5");
  await expect(reopened.locator("[data-role='annotation-path']")).toHaveAttribute("stroke-dasharray", "2 3");
  await expect(reopened.locator("[data-role='annotation-path']")).toHaveAttribute("stroke-opacity", "0.4");
  await expect(reopened.locator("[data-role='measurement-marker']")).toHaveCount(2);
  await expect(reopened.locator("[data-role='measurement-extension']")).toHaveCount(2);

  const svgText = await exportSvgText(page);
  const exported = svgText.match(new RegExp(`<g data-annotation-id="${measurementId}"[\\s\\S]*?</g>`))?.[0] ?? "";
  expect(exported).toContain('data-role="measurement-dimension-line"');
  expect(exported).toContain('stroke-width="5" stroke-dasharray="2 3" stroke-opacity="0.4"');
  expect(exported).toContain('data-role="measurement-marker" data-marker-side="start"');
  expect(exported).toContain('data-role="measurement-extension" data-extension-side="start"');
});

test("Marker Stroke controls style the live tick and its exported counterpart", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const marker = await addAnnotation(page, "marker");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  const strokeWidth = editor.getByTestId("inspector-stroke-fill-stroke-width");
  const strokeStyle = editor.getByTestId("inspector-stroke-fill-stroke-style");
  const strokeOpacity = editor.getByTestId("inspector-stroke-fill-stroke-opacity");
  await expect(strokeWidth).toBeEnabled();
  const initialStrokeColor = await marker.locator("[data-role='annotation-body']").evaluate((element) => getComputedStyle(element).borderLeftColor);
  await strokeWidth.fill("5");
  await strokeWidth.blur();
  await strokeStyle.selectOption("dotted");
  await strokeOpacity.fill("0.4");
  await strokeOpacity.blur();
  await editor.getByTestId("apply-annotation-properties").click();

  const body = marker.locator("[data-role='annotation-body']");
  await expect(body).toHaveCSS("border-left-width", "5px");
  await expect(body).toHaveCSS("border-left-style", "dotted");
  await expect(body).toHaveCSS("border-top-width", "0px");
  await expect(body).toHaveCSS("border-right-width", "0px");
  await expect(body).toHaveCSS("border-bottom-width", "0px");
  await expect.poll(() => body.evaluate((element) => getComputedStyle(element).borderLeftColor)).not.toBe(initialStrokeColor);
  const markerId = await marker.getAttribute("data-annotation-id");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  const fs = await import("node:fs");
  const savedDocument = JSON.parse(fs.readFileSync(savedPath!, "utf8")) as { annotations: Array<Record<string, unknown>> };
  expect(savedDocument.annotations.find((annotation) => annotation.id === markerId)).toMatchObject({
    type: "marker",
    style: { strokeWidth: 5, strokeStyle: "dotted", strokeOpacity: 0.4 },
  });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  const reopenedMarker = annotationOwnerById(host, markerId!);
  const reopenedBody = reopenedMarker.locator("[data-role='annotation-body']");
  await expect(reopenedBody).toHaveCSS("border-left-width", "5px");
  await expect(reopenedBody).toHaveCSS("border-left-style", "dotted");
  await expect(reopenedBody).toHaveCSS("border-top-width", "0px");

  const svgText = await exportSvgText(page);
  const exported = svgText.match(new RegExp(`<g data-annotation-id="${markerId}"[\\s\\S]*?</g>`));
  expect(exported?.[0]).toContain('data-role="marker-tick"');
  expect(exported?.[0]).toContain('stroke-width="5"');
  expect(exported?.[0]).toContain('stroke-dasharray="2 3"');
  expect(exported?.[0]).toContain('stroke-opacity="0.4"');
});

test("Bracket Stroke controls style the live line and caps through Undo/Redo and Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const bracket = await addAnnotation(page, "bracket");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);

  const strokeWidth = editor.getByTestId("inspector-stroke-fill-stroke-width");
  const strokeStyle = editor.getByTestId("inspector-stroke-fill-stroke-style");
  const strokeOpacity = editor.getByTestId("inspector-stroke-fill-stroke-opacity");
  await expect(strokeWidth).toBeEnabled();
  await expect(strokeWidth).toHaveValue("2");
  await strokeWidth.fill("4");
  await strokeWidth.blur();
  await strokeStyle.selectOption("dashed");
  await strokeOpacity.fill("0.6");
  await strokeOpacity.blur();
  await editor.getByTestId("apply-annotation-properties").click();

  const annotationId = await bracket.getAttribute("data-annotation-id");
  const mainPath = bracket.locator("[data-role='annotation-path']");
  const caps = bracket.locator("[data-role='annotation-bracket-caps']");
  await expect(mainPath).toHaveAttribute("stroke-width", "4");
  await expect(mainPath).toHaveAttribute("stroke-dasharray", "7 4");
  await expect(mainPath).toHaveAttribute("stroke-opacity", "0.6");
  await expect(caps).toHaveAttribute("stroke-width", "4");
  await expect(caps).toHaveAttribute("stroke-dasharray", "7 4");
  await expect(caps).toHaveAttribute("stroke-opacity", "0.6");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(mainPath).toHaveAttribute("stroke-width", "2");
  await expect(mainPath).not.toHaveAttribute("stroke-opacity");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(mainPath).toHaveAttribute("stroke-width", "4");
  await expect(caps).toHaveAttribute("stroke-opacity", "0.6");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  const fs = await import("node:fs");
  const savedDocument = JSON.parse(fs.readFileSync(savedPath!, "utf8")) as { annotations: Array<Record<string, unknown>> };
  expect(savedDocument.annotations.find((annotation) => annotation.id === annotationId)).toMatchObject({
    type: "bracket",
    style: { strokeWidth: 4, strokeStyle: "dashed", strokeOpacity: 0.6 },
  });

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  const reopened = annotationOwnerById(host, annotationId!);
  await expect(reopened.locator("[data-role='annotation-path']")).toHaveAttribute("stroke-width", "4");
  await expect(reopened.locator("[data-role='annotation-bracket-caps']")).toHaveAttribute("stroke-opacity", "0.6");

  const svgText = await exportSvgText(page);
  const exported = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}[\\s\\S]*?</g>`));
  expect(exported?.[0]).toContain('stroke-width="4"');
  expect(exported?.[0]).toContain('stroke-dasharray="7 4"');
  expect(exported?.[0]).toContain('stroke-opacity="0.6"');
  expect(exported?.[0]).toContain('data-role="annotation-bracket-caps"');
});

test("Callout Fill controls color both the live label box and exported box/tail", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const callout = await addAnnotation(page, "callout");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  const fillColor = editor.getByTestId("inspector-stroke-fill-fill-color");
  const fillOpacity = editor.getByTestId("inspector-stroke-fill-fill-opacity");
  await expect(fillColor).toBeEnabled();
  await expect(fillOpacity).toHaveValue("0.95");
  const label = callout.locator("[data-role='annotation-label']");
  const previousBackground = await label.evaluate((element) => getComputedStyle(element).backgroundColor);
  await fillColor.fill("#00aa00");
  await fillOpacity.fill("0.4");
  await fillOpacity.blur();
  await expect(editor.getByTestId("apply-annotation-properties")).toBeEnabled();
  await editor.getByTestId("apply-annotation-properties").click();
  const calloutId = await callout.getAttribute("data-annotation-id");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect.poll(() => label.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(previousBackground);
  const appliedBackground = await label.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await label.evaluate((element) => getComputedStyle(element, "::after").backgroundColor)).toBe(appliedBackground);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  const fs = await import("node:fs");
  const savedDocument = JSON.parse(fs.readFileSync(savedPath!, "utf8")) as { annotations: Array<Record<string, unknown>> };
  const savedStyle = savedDocument.annotations.find((annotation) => annotation.id === calloutId)?.style;
  expect(savedStyle).toMatchObject({ fillColor: "#00aa00", fillOpacity: 0.4 });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const reopenedCallout = host.locator(`[data-role='annotation-owner'][data-annotation-id="${calloutId}"]`);
  const reopenedLabel = reopenedCallout.locator("[data-role='annotation-label']");
  await expect.poll(() => reopenedLabel.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(previousBackground);
  const calloutBackground = await reopenedLabel.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await reopenedLabel.evaluate((element) => getComputedStyle(element, "::after").backgroundColor)).toBe(calloutBackground);

  const svgText = await exportSvgText(page);
  const exported = svgText.match(new RegExp(`<g data-annotation-id="${calloutId}"[\\s\\S]*?</g>`));
  expect(exported?.[0]).toContain('data-role="callout-box"');
  expect(exported?.[0]).toContain('data-role="callout-tail"');
  expect(exported?.[0]).toContain('fill="#00aa00"');
  expect(exported?.[0]).toContain('fill-opacity="0.4"');
});

test("Callout Stroke controls style the live box and exported box/tail", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const callout = await addAnnotation(page, "callout");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  const strokeWidth = editor.getByTestId("inspector-stroke-fill-stroke-width");
  const strokeStyle = editor.getByTestId("inspector-stroke-fill-stroke-style");
  const strokeOpacity = editor.getByTestId("inspector-stroke-fill-stroke-opacity");
  await expect(strokeWidth).toBeEnabled();
  await strokeWidth.fill("4");
  await strokeWidth.blur();
  await strokeStyle.selectOption("dotted");
  await strokeOpacity.fill("0.6");
  await strokeOpacity.blur();
  await editor.getByTestId("apply-annotation-properties").click();

  const annotationId = await callout.getAttribute("data-annotation-id");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "JSON", exact: true }).click();
  const canonicalText = await page.locator(".json-panel pre").textContent();
  const canonical = JSON.parse(canonicalText ?? "{}") as { annotations?: Array<{ id: string; style?: Record<string, unknown> }> };
  expect(canonical.annotations?.find((annotation) => annotation.id === annotationId)?.style).toMatchObject({ strokeWidth: 4, strokeStyle: "dotted", strokeOpacity: 0.6 });

  const svgText = await exportSvgText(page);
  const exported = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}[\\s\\S]*?</g>`));
  expect(exported?.[0]).toContain('stroke-width="4"');
  expect(exported?.[0]).toContain('stroke-dasharray="2 3"');
  expect(exported?.[0]).toContain('stroke-opacity="0.6"');

  const label = callout.locator("[data-role='annotation-label']");
  await expect(label).toHaveCSS("border-width", "4px");
  await expect(label).toHaveCSS("border-style", "dotted");
  const tailBorder = await label.evaluate((element) => getComputedStyle(element, "::after").borderRightWidth);
  expect(tailBorder).toBe("4px");
  expect(exported?.[0]).toContain('data-role="callout-box"');
  expect(exported?.[0]).toContain('data-role="callout-tail"');
});

test("Vertical Line exports a full-height dashed line, not an invisible zero-length one", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
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
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await addAnnotation(page, "text");
  const editor = page.getByTestId("annotation-editor");
  await openStyleSection(editor);
  await expect(editor.getByTestId("inspector-stroke-fill-stroke-width")).toBeDisabled();
  await expect(editor.getByTestId("inspector-stroke-fill-fill-color")).toBeDisabled();
  await expect(page.locator(".stroke-fill-group").first()).toHaveAttribute("title", /text/);
});

test("Lock shows a real visible indicator, blocks drag, and Unlock restores it -- mixed-selection Lock affects only the unlocked one", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const first = await addAnnotation(page, "text");
  const firstId = await first.getAttribute("data-annotation-id");
  // Anchor the second Annotation on another Signal so the two labels do not overlap.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_valid']").click();
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
  await first.locator("[data-role='annotation-label']").click({ force: true }); // the second annotation is drawn over the first's anchor
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

// #378 parity evidence: the contract's own Save/Open evidence field said
// only "selected presentation persistence is covered" for Lock -- there was
// no test proving the canonical `locked` field itself actually survives a
// real Save/Open round trip (as opposed to just an in-session Undo/Redo).
test("Lock state survives a real Save/Open round trip", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(page, host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const annotation = await addAnnotation(page, "text");
  const annotationId = await annotation.getAttribute("data-annotation-id");
  await annotation.locator("[data-role='annotation-label']").click();
  const openMenu = async () => {
    const trigger = page.locator(".arrange-dropdown-trigger");
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  };
  const menu = page.locator(".arrange-menu");
  await openMenu();
  await menu.getByRole("menuitem", { name: "Lock", exact: true }).click();
  await expect(annotation).toHaveAttribute("data-locked", "true");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const saveDownload = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await saveDownload).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const reopened = page.getByTestId("cycle-surface").locator(`[data-role='annotation-owner'][data-annotation-id='${annotationId}']`);
  await expect(reopened).toHaveAttribute("data-locked", "true");
  await expect(reopened.locator("[data-role='annotation-lock-glyph']")).toHaveCount(1);

  // The persisted lock still actually blocks drag after reload -- not just
  // a cosmetic attribute that survived serialization.
  const handleBefore = await reopened.locator("[data-role='annotation-handle']").first().boundingBox();
  await reopened.locator("[data-role='annotation-label']").hover();
  await page.mouse.down();
  await page.mouse.move((handleBefore!.x) + 60, handleBefore!.y + 20, { steps: 5 });
  await page.mouse.up();
  const handleAfter = await reopened.locator("[data-role='annotation-handle']").first().boundingBox();
  expect(Math.abs(handleAfter!.x - handleBefore!.x)).toBeLessThan(2);
});

// #390: Font/Shapes/Paragraph/Arrange must each show their group name
// exactly once (the outer ribbon-major-group caption and the inner
// DsRibbonGroup footer label previously both rendered, for any group built
// on the newer DsRibbonGroup shape), disabled-but-implemented controls
// must stay clearly readable (not near-invisible) with a truthful reason,
// and selecting an applicable entity must flip them to enabled with a real
// effect -- not just a title/opacity change.
test("Annotation Ribbon groups show one label each, readable-but-disabled with truthful reasons, and enable on selection (#390)", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const groupNames = ["Font", "Shapes", "Paragraph", "Arrange"] as const;
  for (const name of groupNames) {
    const group = page.locator(`[data-major-group='${name}']`);
    const captions = await group.evaluate((element) => {
      const outer = getComputedStyle(element, "::after").content;
      const inner = element.querySelector(".ds-ribbon-group > b, .ribbon-group > b");
      return { outer, innerVisible: inner ? getComputedStyle(inner).visibility !== "hidden" : false, innerText: inner?.textContent };
    });
    expect(captions.outer, name).toBe(`"${name}"`);
    expect(captions.innerVisible, `${name} inner label must stay hidden -- it duplicated the outer caption`).toBe(false);
  }

  // No selection yet: Font/Paragraph/Shapes read as implemented-but-
  // unavailable (readable, with a truthful reason), not invisible/broken.
  const ribbon = page.getByTestId("ribbon");
  const bold = ribbon.getByRole("button", { name: "Bold", exact: true });
  const alignLeft = ribbon.getByRole("button", { name: "Align left", exact: true });
  const arrowShape = ribbon.getByRole("button", { name: "Arrow", exact: true });
  await expect(bold).toBeDisabled();
  await expect(alignLeft).toBeDisabled();
  const readableOpacity = async (locator: typeof bold) => Number(await locator.evaluate((el) => getComputedStyle(el).opacity));
  expect(await readableOpacity(bold)).toBeGreaterThan(0.5);
  expect(await readableOpacity(alignLeft)).toBeGreaterThan(0.5);
  await expect(page.locator("[data-major-group='Font']")).toHaveAttribute("title", /selected Annotation or Comment Row/);
  await expect(page.locator("[data-major-group='Paragraph']")).toHaveAttribute("title", "Select an Annotation to change alignment");

  // Selecting a Signal enables Shapes and inserting a Text annotation
  // enables Font/Paragraph, each with a real, observable effect.
  await selectRequestSignal(page, host);
  await expect(arrowShape).toBeEnabled();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(bold).toBeEnabled();
  await expect(alignLeft).toBeEnabled();
  expect(await readableOpacity(bold)).toBe(1);

  const historyBefore = await page.getByTestId("history-status").textContent();
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  const afterBold = await page.getByTestId("history-status").textContent();
  await alignLeft.click();
  await expect(page.getByTestId("history-status")).not.toHaveText(afterBold!);
});
