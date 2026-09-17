import { expect, test } from "@playwright/test";

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
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Annotation", exact: true }).click();
  const list = page.getByTestId("annotation-list");
  const previousIds = new Set(await list.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")).filter((id): id is string => id !== null)));
  await page.getByLabel("Annotation type").selectOption(type);
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect.poll(async () => {
    const ids = await list.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")).filter((id): id is string => id !== null));
    return ids.filter((id) => !previousIds.has(id)).length;
  }).toBe(1);
  const idsAfterCreate = await list.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")).filter((id): id is string => id !== null));
  const createdIds = idsAfterCreate.filter((id) => !previousIds.has(id));
  expect(createdIds).toHaveLength(1);
  const createdId = createdIds[0]!;
  const owner = page.getByTestId("cycle-surface").locator(`[data-role='annotation-owner'][data-annotation-id='${createdId}'][data-annotation-type='${type}']`);
  await expect(owner).toBeVisible();
  return owner;
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
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const callout = await addAnnotation(page, "callout");
  const editor = page.getByTestId("annotation-editor");
  const labelField = editor.getByLabel("Annotation label", { exact: true });
  await expect(labelField).toHaveJSProperty("tagName", "TEXTAREA");
  await labelField.fill("Line one\nLine two\nLine three");
  await editor.getByTestId("apply-annotation-properties").click();

  const label = callout.locator("[data-role='annotation-label']");
  await expect(label).toHaveCSS("white-space", "pre-wrap");
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

test("Bracket's exported SVG carries its own cap marks, not a plain Range line", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
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
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
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

test("Marker and Bracket preserve stable identity and semantic anchors through Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const marker = await addAnnotation(page, "marker");
  const markerId = await marker.getAttribute("data-annotation-id");
  expect(markerId).toBeTruthy();
  const bracket = await addAnnotation(page, "bracket");
  const bracketId = await bracket.getAttribute("data-annotation-id");
  expect(bracketId).toBeTruthy();
  expect(bracketId).not.toBe(markerId);

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  const fs = await import("node:fs");
  type SavedAnnotation = { id: string; type: string; label: string; anchor?: { signalId: string; cycle: number; point: string }; start?: { signalId: string; cycle: number; point: string }; end?: { signalId: string; cycle: number; point: string } };
  const readSaved = () => JSON.parse(fs.readFileSync(savedPath!, "utf-8")) as { annotations: readonly SavedAnnotation[] };
  const saved = readSaved();
  const savedMarker = saved.annotations.find((annotation) => annotation.id === markerId);
  const savedBracket = saved.annotations.find((annotation) => annotation.id === bracketId);
  expect(savedMarker).toMatchObject({ id: markerId, type: "marker", anchor: { signalId: "sig_cycle_request" } });
  expect(savedBracket).toMatchObject({ id: bracketId, type: "bracket", start: { signalId: "sig_cycle_request" }, end: { signalId: "sig_cycle_request" } });

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  const reopenedMarker = host.locator(`[data-role='annotation-owner'][data-annotation-id='${markerId}'][data-annotation-type='marker']`);
  const reopenedBracket = host.locator(`[data-role='annotation-owner'][data-annotation-id='${bracketId}'][data-annotation-type='bracket']`);
  await expect(reopenedMarker).toBeVisible();
  await expect(reopenedBracket).toBeVisible();
  const list = page.getByTestId("annotation-list");
  await expect(list.locator(`[data-annotation-list-id='${markerId}']`)).toBeVisible();
  await expect(list.locator(`[data-annotation-list-id='${bracketId}']`)).toBeVisible();

  const saveAgain = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const reopenedPath = await (await saveAgain).path();
  expect(reopenedPath).toBeTruthy();
  const reopenedDocument = JSON.parse(fs.readFileSync(reopenedPath!, "utf-8")) as { annotations: readonly SavedAnnotation[] };
  expect(reopenedDocument.annotations.find((annotation) => annotation.id === markerId)).toEqual(savedMarker);
  expect(reopenedDocument.annotations.find((annotation) => annotation.id === bracketId)).toEqual(savedBracket);
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
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
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
  await expect(label).toHaveCSS("white-space", "pre-wrap");
  await expect(label).toHaveText("Line one\nLine two\nLine three");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  expect((groupMatch![0].match(/<tspan/g) ?? []).length).toBe(3);
  expect(groupMatch![0]).toContain("Line one");
  expect(groupMatch![0]).toContain("Line two");
  expect(groupMatch![0]).toContain("Line three");
});
