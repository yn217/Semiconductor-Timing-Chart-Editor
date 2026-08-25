import { expect, test, type Locator } from "@playwright/test";

test("keeps text glyph aspect ratio and X-axis alignment constant across Zoom levels 50/100/150/200%", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ruler = page.getByTestId("cycle-ruler");
  const tick0 = ruler.locator("[data-cycle='0']");
  const busText = surface.locator("[data-signal-id='sig_cycle_data'] > svg text").filter({ hasText: "A5" });
  const requestUses = surface.locator("[data-signal-id='sig_cycle_request'] > svg use");
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");
  await tabs.getByRole("button", { name: "View", exact: true }).click();

  const aspect = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return box.width / box.height;
  };

  const tickAspectAt100 = await aspect(tick0);
  const busAspectAt100 = await aspect(busText);

  const checkAt = async (label: string) => {
    await expect(page.getByTestId("zoom-status")).toHaveText(label);
    // font/glyph aspect ratio must never change with zoom
    expect(await aspect(tick0)).toBeCloseTo(tickAspectAt100, 3);
    expect(await aspect(busText)).toBeCloseTo(busAspectAt100, 3);
    // the REQUEST signal's 0->1 transition (rendered "use" element index 6, at cycle 3)
    // must stay aligned with the ruler's cycle-3 tick at every zoom level
    const cycle3X = (await ruler.locator("[data-cycle='3']").boundingBox())!.x;
    const transitionX = (await requestUses.nth(6).boundingBox())!.x;
    expect(Math.abs(transitionX - cycle3X)).toBeLessThan(5);
  };

  await checkAt("100%");
  await ribbon.getByRole("button", { name: "Zoom out" }).click();
  await ribbon.getByRole("button", { name: "Zoom out" }).click();
  await checkAt("50%");
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await checkAt("150%");
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await checkAt("200%");

  // Frozen Signal/Role column geometry is untouched by Zoom
  const frozenName = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='frozen-signal-name']");
  const before = await frozenName.boundingBox();
  await ribbon.getByRole("button", { name: "Zoom out" }).click();
  const after = await frozenName.boundingBox();
  expect(after).toEqual(before);
});

test("Zoom does not trigger WaveDrom rerender, LocalGeometry rebuild, Canonical, or History changes", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  const revisionBefore = await page.getByTestId("revision-status").textContent();
  const historyBefore = await page.getByTestId("history-status").textContent();
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;

  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom out" }).click();

  await expect(page.getByTestId("revision-status")).toHaveText(revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
});
