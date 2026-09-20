import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #418: a Measurement anchored on the top-row Signal placed its dimension
// line/label 18px-per-lane *above* the anchor by default -- which, for a
// top-row anchor, pushed the label into the surface's reserved top padding
// where the sticky Cycle Ruler sits, hiding it. This asserts the real
// production creation flow (Insert/Annotation ribbon -> Add annotation,
// never constructed Canonical state directly) produces a Measurement whose
// label/dimension line/markers never overlap the Ruler's own bounding box,
// regardless of which row it starts on.

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
}

test("a Measurement anchored on the top-row Signal places its label/line below the row, never behind the Ruler", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  // CLOCK is the first (top) row in the default fixture.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']").last();
  await expect(owner).toBeVisible();
  await expect(owner).toHaveAttribute("data-measurement-side", "below");

  const ruler = page.getByTestId("cycle-ruler");
  const rulerBox = (await ruler.boundingBox())!;
  const label = owner.locator("[data-role='annotation-label']");
  const body = owner.locator("[data-role='annotation-body']");
  const labelBox = (await label.boundingBox())!;
  const bodyBox = (await body.boundingBox())!;
  expect(overlaps(labelBox, rulerBox), JSON.stringify({ labelBox, rulerBox })).toBe(false);
  expect(overlaps(bodyBox, rulerBox), JSON.stringify({ bodyBox, rulerBox })).toBe(false);
  for (const marker of await owner.locator("[data-role='measurement-marker']").all()) {
    const markerBox = (await marker.boundingBox())!;
    expect(overlaps(markerBox, rulerBox), JSON.stringify({ markerBox, rulerBox })).toBe(false);
  }
});

test("a Measurement anchored well below the top row keeps its default above-the-line placement", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  // RESULT[7:0] is well below the top row -- plenty of clearance above it.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_result']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']").last();
  await expect(owner).toHaveAttribute("data-measurement-side", "above");
});
