import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import { annotationOwnerById, snapshotAnnotationIds, waitForCreatedAnnotationId } from "./annotation-identity.js";

startInCycleMode(test);

// #377: Marker/Callout/Bracket completeness -- three concrete gaps fixed:
//  1. Annotation label could not hold multi-line text at all (a plain
//     <input> cannot contain "\n"), most critically for Callout.
//  2. The live-DOM label span collapsed embedded "\n" (default
//     `white-space: normal`) even once the input could hold it.
//  3. The standalone SVG export pipeline (packages/export/src/index.ts)
//     drew Bracket as a plain zero-cap line and Marker as an invisible
//     zero-length line -- neither matched its own live-DOM glyph.
// These tests assert the fixes at both layers: live DOM and exported SVG.

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
  return fs.readFileSync(path!, "utf-8");
}

test("Callout label holds real multi-line text in the live DOM and exported SVG", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const callout = await addAnnotation(page, "callout");
  const editor = page.getByTestId("annotation-editor");
  const labelField = editor.getByLabel("Annotation label", { exact: true });
  await expect(labelField).toHaveJSProperty("tagName", "TEXTAREA");
  await labelField.fill("Line one\nLine two\nLine three");
  await editor.getByTestId("apply-annotation-properties").click();

  const label = callout.locator("[data-role='annotation-label']");
  await expect(label).toHaveCSS("white-space", "pre");
  await expect(label).toHaveText("Line one\nLine two\nLine three");
  const annotationId = await callout.getAttribute("data-annotation-id");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  // #377: a bare SVG <text> ignores embedded "\n" -- one <tspan> per line is
  // the standard SVG multi-line idiom (packages/export/src/index.ts's new
  // `multilineText` helper), so three source lines must yield three <tspan>s.
  expect((groupMatch![0].match(/<tspan/g) ?? []).length).toBe(3);
  expect(groupMatch![0]).toContain("Line one");
  expect(groupMatch![0]).toContain("Line two");
  expect(groupMatch![0]).toContain("Line three");
});

test("authored label wrap width is shared by live overlay and SVG export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const callout = await addAnnotation(page, "callout");
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("Address phase carries a detailed payload across the bus");
  await editor.getByRole("button", { name: "Style", exact: true }).click();
  const width = editor.getByTestId("inspector-annotation-label-layout-max-width");
  await width.fill("48");
  await width.press("Enter");
  const lineHeight = editor.getByTestId("inspector-annotation-label-layout-line-height");
  await lineHeight.fill("1.8");
  await lineHeight.press("Enter");
  await editor.getByLabel("Annotation label placement", { exact: true }).selectOption("below");
  await editor.getByTestId("apply-annotation-properties").click();

  const label = callout.locator("[data-role='annotation-label']");
  // The authored unitless 1.8 resolves to px in computed style (1.8 x the 10px label font = 18px).
  await expect(label).toHaveCSS("line-height", "18px");
  const liveText = await label.textContent();
  expect(liveText?.split("\n").length).toBeGreaterThan(2);
  const annotationId = await callout.getAttribute("data-annotation-id");
  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  expect((groupMatch![0].match(/<tspan/g) ?? []).length).toBe(liveText!.split("\n").length);
  expect(groupMatch![0]).toContain('dy="18"');
  const livePosition = await label.evaluate((element) => (element as HTMLElement).style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)?.slice(1));
  expect(livePosition).not.toBeNull();
  const exported = groupMatch![0].match(/<text x="([-\d.]+)" y="([-\d.]+)"/);
  expect(exported).not.toBeNull();
  // The live label is positioned inside the waveform viewport; the export adds the frozen name column (200px) and the ruler header (184px).
  expect(Number(exported![1]) - Number(livePosition![0])).toBeCloseTo(200, 0);
  expect(Number(exported![2]) - Number(livePosition![1])).toBeCloseTo(183.5, 0);
});

test("annotation label placement presets move the live label between its semantic endpoints and above/below", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const range = await addAnnotation(page, "range");
  const editor = page.getByTestId("annotation-editor");
  await editor.getByRole("button", { name: "Style", exact: true }).click(); // Label placement lives in the Inspector Style section
  const placement = editor.getByLabel("Annotation label placement", { exact: true });
  const position = async () => range.locator("[data-role='annotation-label']").evaluate((element) => {
    const match = (element as HTMLElement).style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  });
  const applyPlacement = async (value: string) => {
    await placement.selectOption(value);
    await editor.getByTestId("apply-annotation-properties").click();
    await expect(range.locator("[data-role='annotation-label']")).toBeVisible();
    return position();
  };

  const start = await applyPlacement("start");
  const center = await applyPlacement("center");
  const end = await applyPlacement("end");
  const above = await applyPlacement("above");
  const below = await applyPlacement("below");
  expect(start).not.toBeNull(); expect(center).not.toBeNull(); expect(end).not.toBeNull();
  expect(above).not.toBeNull(); expect(below).not.toBeNull();
  expect(start!.x).toBeLessThan(center!.x);
  expect(center!.x).toBeLessThan(end!.x);
  expect(above!.y).toBeLessThan(center!.y);
  expect(center!.y).toBeLessThan(below!.y);
});

test("Bracket's exported SVG carries its own cap marks, not a plain Range line", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const bracket = await addAnnotation(page, "bracket");
  await expect(bracket.locator("[data-role='annotation-bracket-caps']")).toHaveCount(1);
  const annotationId = await bracket.getAttribute("data-annotation-id");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  // #377: matches the live-DOM data-role exactly, giving Bracket a distinct,
  // testable exported shape instead of falling through to the generic
  // point/line fallback (which drew no cap marks at all).
  expect(groupMatch![0]).toContain(`data-role="annotation-bracket-caps"`);
  expect(groupMatch![0]).toMatch(/<path[^>]*data-role="annotation-bracket-caps"[^>]*d="M [^"]+"/);
});

test("Marker's exported SVG carries a vertical tick glyph, not an invisible zero-length line", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const marker = await addAnnotation(page, "marker");
  // Live-DOM glyph: a 3px-wide, 28px-tall vertical tick (center-columns.css).
  await expect(marker.locator("[data-role='annotation-body']")).toHaveCSS("height", "28px");
  const annotationId = await marker.getAttribute("data-annotation-id");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  const tick = groupMatch![0].match(/<line data-role="marker-tick" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/);
  expect(tick).not.toBeNull();
  // Vertical: same x, and a fixed 28px span between y1/y2 -- matching the
  // live-DOM glyph's own height, not a zero-length point.
  expect(tick![1]).toBe(tick![3]);
  expect(Math.abs(Number(tick![4]) - Number(tick![2]))).toBeCloseTo(28, 0);
});

// #377 parity evidence: the contract's `saveOpen` field said only
// "primitive lifecycle Save/Open is covered generically" -- there was no
// test proving a multi-line label (this issue's own headline fix: a plain
// <input> cannot hold "\n" at all) survives a real Save/Open round trip,
// as opposed to just an in-session Apply.
test("Callout's multi-line label survives a real Save/Open round trip, in both the live DOM and the exported SVG", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const callout = await addAnnotation(page, "callout");
  const annotationId = await callout.getAttribute("data-annotation-id");
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("Line one\nLine two\nLine three");
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(callout.locator("[data-role='annotation-label']")).toHaveText("Line one\nLine two\nLine three");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const saveDownload = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await saveDownload).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const reopened = page.getByTestId("cycle-surface").locator(`[data-role='annotation-owner'][data-annotation-id='${annotationId}']`);
  const label = reopened.locator("[data-role='annotation-label']");
  await expect(label).toHaveCSS("white-space", "pre");
  await expect(label).toHaveText("Line one\nLine two\nLine three");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  expect((groupMatch![0].match(/<tspan/g) ?? []).length).toBe(3);
  expect(groupMatch![0]).toContain("Line one");
  expect(groupMatch![0]).toContain("Line two");
  expect(groupMatch![0]).toContain("Line three");
});
