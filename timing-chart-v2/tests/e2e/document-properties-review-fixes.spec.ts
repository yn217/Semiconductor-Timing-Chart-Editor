import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
import { documentState, expectViewOnly } from "./view-only.js";

startInCycleSample(test);

async function openDocumentProperties(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  return openPropertiesFromRibbon(page);
}

/** Reopens the dialog without reloading, so the document edited earlier in the same test is kept. */
async function openPropertiesFromRibbon(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  return page.getByRole("dialog", { name: "Document Properties" });
}

async function saveDocumentJson(page: Page): Promise<{ legend: { usedRolesOnly: boolean; items?: unknown; positionMode?: string; position: { x: number; y: number } } }> {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}

test("Apply without edits leaves the legend unchanged and reports nothing changed", async ({ page }) => {
  const properties = await openDocumentProperties(page);
  const before = await documentState(page);
  await properties.getByTestId("apply-document-properties").click();
  await expect(properties.getByTestId("legend-status")).toHaveText("No document properties changed");
  await expectViewOnly(page, before, "a no-edit Apply must not create a Canonical revision");
});

test("Used Roles Only change keeps the implicit legend items instead of writing signal roles", async ({ page }) => {
  const properties = await openDocumentProperties(page);
  await properties.getByLabel("Legend used roles only").uncheck();
  await properties.getByTestId("apply-document-properties").click();
  await expect(properties.getByTestId("legend-status")).toHaveText("Properties applied");
  await properties.getByRole("button", { name: "Close properties" }).click();

  const saved = await saveDocumentJson(page);
  expect(saved.legend.usedRolesOnly).toBe(false);
  expect(saved.legend.items).toBeUndefined();
});

test("canvas-corner legend offsets are not clamped to the pixel surface on Apply", async ({ page }) => {
  const properties = await openDocumentProperties(page);
  await properties.getByLabel("Legend show").check();
  await properties.getByTestId("apply-document-properties").click();
  await expect(properties.getByTestId("legend-status")).toHaveText("Properties applied");
  await properties.getByRole("button", { name: "Close properties" }).click();

  await page.getByTestId("editor-legend").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toHaveAttribute("data-inspector-entity", "legend");
  await inspector.getByLabel("Legend position mode").selectOption("canvas-corner");
  await inspector.getByLabel("Legend X", { exact: true }).fill("0");
  await inspector.getByLabel("Legend Y", { exact: true }).fill("0");
  await page.getByTestId("apply-legend-properties").click();

  const reopened = await openPropertiesFromRibbon(page);
  await reopened.getByLabel("Legend position X").fill("100000");
  await reopened.getByTestId("apply-document-properties").click();
  await expect(reopened.getByTestId("legend-status")).toHaveText("Properties applied");
  await reopened.getByRole("button", { name: "Close properties" }).click();

  const saved = await saveDocumentJson(page);
  expect(saved.legend.show).toBe(true);
  expect(saved.legend.positionMode).toBe("canvas-corner");
  expect(saved.legend.position.x).toBe(100000);
});

test("empty or non-finite Legend position is rejected and nothing is applied", async ({ page }) => {
  const properties = await openDocumentProperties(page);
  const before = await documentState(page);

  await properties.getByLabel("Legend position X").fill("");
  await properties.getByTestId("apply-document-properties").click();
  await expect(properties.getByTestId("legend-status")).toHaveText(/finite/);

  await properties.getByLabel("Legend position X").fill("1e400");
  await properties.getByLabel("Legend position Y").fill("5");
  await properties.getByTestId("apply-document-properties").click();
  await expect(properties.getByTestId("legend-status")).toHaveText(/finite/);

  await expectViewOnly(page, before, "rejected legend positions must not create a Canonical revision");
});

test("Export filename replaces characters that no file system accepts", async ({ page }) => {
  // Chromium sanitizes download names itself, so record the anchor `download` attribute the app sets before the browser sees it.
  await page.addInitScript(() => {
    const names: string[] = [];
    (window as unknown as { __downloadNames: string[] }).__downloadNames = names;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (this.download) names.push(this.download); return click.call(this); };
  });
  const properties = await openDocumentProperties(page);
  await properties.getByLabel("Document title").fill("a/b:c");
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();

  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pending = page.waitForEvent("download");
  await dialog.getByLabel("Export format").selectOption("svg");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  await pending;
  expect(await page.evaluate(() => (window as unknown as { __downloadNames: string[] }).__downloadNames)).toEqual(["a_b_c.svg"]);
});

test("Add State Enum works where crypto.randomUUID is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
  });
  const properties = await openDocumentProperties(page);
  await properties.getByRole("button", { name: "Add State Enum", exact: true }).click();
  await expect(properties.locator("[data-enum-id]")).toHaveCount(1);
});
