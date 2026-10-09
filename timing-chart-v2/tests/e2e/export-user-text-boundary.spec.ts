import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { annotationOwnerById, snapshotAnnotationIds, waitForCreatedAnnotationId } from "./annotation-identity.js";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

const hostile = `<script>alert(1)</script> <image href="javascript:alert(1)"> <text onclick="alert(1)">x</text>`;

test("browser SVG export keeps adversarial document text inert", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Document title").fill(hostile);
  await properties.getByLabel("Document description").fill(hostile);
  await properties.getByLabel("Footer text").fill(hostile);
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();

  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pending = page.waitForEvent("download");
  await dialog.getByLabel("Export format").selectOption("svg");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const download = await pending;
  const svg = (await readFile((await download.path())!)).toString("utf8");

  expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(svg).not.toMatch(/<script\b|<image\b|<text[^>]*\bon[a-z][\\w:-]*\\s*=/i);
  expect(svg).not.toMatch(/(?:href|xlink:href)=\"\s*javascript:/i);
});

test("production-authored Annotation text stays inert in live DOM and SVG export", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.evaluate(() => { (window as Window & { __annotationTextAttack?: boolean }).__annotationTextAttack = false; });

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  const beforeIds = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Add annotation" }).click();
  const annotationId = await waitForCreatedAnnotationId(host, beforeIds, "text");
  const annotation = annotationOwnerById(host, annotationId);
  const hostileAnnotationText = `<script>window.__annotationTextAttack = true</script> <image href="javascript:alert(1)"> <span onclick="alert(1)">label</span>`;

  const editor = page.getByTestId("annotation-editor");
  await expect(editor).toHaveAttribute("data-annotation-id", annotationId);
  await editor.getByLabel("Annotation label", { exact: true }).fill(hostileAnnotationText);
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(annotation.locator("[data-role='annotation-label']")).toHaveText(hostileAnnotationText);
  await expect(annotation.locator("script, image, [onclick]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __annotationTextAttack?: boolean }).__annotationTextAttack)).toBe(false);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const downloadPath = await (await downloadPromise).path();
  expect(downloadPath).toBeTruthy();
  const exported = await readFile(downloadPath!, "utf8");

  // Export wraps the long label into multiple SVG tspans, so assert the
  // escaped fragments independently instead of assuming one contiguous node.
  expect(exported).toContain("&lt;script&gt;");
  expect(exported).toContain("window.__annotationTextAttack");
  expect(exported).toContain("true&lt;/script&gt;");
  expect(exported).not.toMatch(/<script\b|<image\b|<text[^>]*\bon[a-z][\w:-]*\s*=/i);
  expect(exported).not.toMatch(/(?:href|xlink:href)=\"\s*javascript:/i);
  expect(pageErrors).toEqual([]);
});
