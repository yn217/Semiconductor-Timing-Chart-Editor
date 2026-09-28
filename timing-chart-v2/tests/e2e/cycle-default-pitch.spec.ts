import { expect, test } from "@playwright/test";

// #572: Cycle Mode's default Zoom 100% pitch must render at the document's
// actual geometry width (1 local-geometry unit = 1 CSS pixel), never
// silently compressed to fit whatever width the viewport happens to have.
// A prior regression let a reference-SVG screen-scale measurement -- meant
// only to correct small sub-pixel/DPI rounding -- get taken while the
// renderer host was still constrained by an unrelated resize pass, baking
// in a ~7x compression that persisted for the rest of the session.
test("Cycle Mode default 100% pitch renders at the document's real geometry width, not viewport-fit", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator("text=/Zoom: \\d+%/").first()).toHaveText("Zoom: 100%");

  const measured = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("[data-testid='cycle-surface']");
    const clockOwner = Array.from(document.querySelectorAll<HTMLElement>("[data-role='wave-owner']"))
      .find((el) => el.getAttribute("data-wave-owner")?.toLowerCase().includes("clock"));
    const svg = clockOwner?.querySelector("svg");
    return {
      presentationXScale: host ? Number(getComputedStyle(host).getPropertyValue("--presentation-x-scale")) : undefined,
      viewBoxWidth: svg?.viewBox.baseVal.width,
      renderedWidth: svg?.getBoundingClientRect().width,
    };
  });

  expect(measured.viewBoxWidth).toBeDefined();
  expect(measured.presentationXScale).toBeDefined();
  // The presentation scale is a small DPI/rounding correction only -- it
  // must never collapse toward the viewport's own available width just
  // because that happened to be measured first.
  expect(measured.presentationXScale!).toBeGreaterThan(0.9);
  expect(measured.presentationXScale!).toBeLessThan(1.1);
  // The reference SVG must render at (approximately) its own native
  // geometry width, not a width clamped down to the visible viewport.
  expect(measured.renderedWidth!).toBeGreaterThan(measured.viewBoxWidth! * 0.9);

  // Zoom controls must still work normally on top of this default.
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(page.locator("text=/Zoom: \\d+%/").first()).toHaveText("Zoom: 125%");
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  await expect(page.locator("text=/Zoom: \\d+%/").first()).toHaveText("Zoom: 100%");

  await page.getByRole("button", { name: "Fit All", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  await expect(page.locator("text=/Zoom: \\d+%/").first()).toHaveText("Zoom: 100%");
  const waveWidthAfterFitAllThenReset = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']");
    return viewport ? getComputedStyle(viewport).getPropertyValue("--wave-width") : undefined;
  });
  expect(Number.parseFloat(waveWidthAfterFitAllThenReset ?? "0")).toBeGreaterThan(measured.viewBoxWidth! * 0.9);
});
