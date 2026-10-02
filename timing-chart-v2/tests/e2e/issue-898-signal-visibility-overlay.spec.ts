import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #898: Signal Show/Hide changes RowLayout visibility; Annotations anchored to that row (a.meas measures s.reqv -> s.rspv in the
 * showcase) must be reprojected -- primitives for a hidden row disappear and come back when the row is shown again, with no stale
 * geometry left behind.
 */
test("hiding and showing a Signal reprojects the Annotation overlay anchored to that row", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json"));
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "48");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });

  const primitives = (annotationId: string) => surface.locator(`[data-role='annotation-owner'][data-annotation-id='${annotationId}'] *`).count();
  const before = await primitives("a.meas");
  expect(before, "a.meas (anchored to s.reqv and s.rspv) must render primitives while its row is visible").toBeGreaterThan(0);
  const revision = await surface.getAttribute("data-canonical-revision");

  await surface.locator("[data-role='frozen-row'][data-row-id='s.reqv']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByTestId("signal-visibility").click();
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='s.reqv']")).toHaveCount(0);
  await expect.poll(() => primitives("a.meas"), { message: "annotation anchored to the hidden row must lose its stale primitives" }).toBeLessThan(before);

  await editor.getByTestId("signal-visibility").click();
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='s.reqv']")).toHaveCount(1);
  await expect.poll(() => primitives("a.meas"), { message: "annotation must come back when the row is shown again" }).toBe(before);
  expect(await surface.getAttribute("data-canonical-revision")).not.toBe(revision); // visibility is a real command (Undo-able), not view state
});
