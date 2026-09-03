import { expect, test, type Locator } from "@playwright/test";

test("keeps text glyph aspect ratio and X-axis alignment constant across Zoom levels 50/100/150/200%", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ruler = page.getByTestId("cycle-ruler");
  const tick0 = ruler.locator("[data-cycle='0']");
  const busText = surface.locator("[data-signal-id='sig_cycle_data'] > svg text[data-value-label-index='1']");
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

test("uses measured WaveDrom screen scale for text while keeping geometry aligned", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const text = host.locator("[data-role='stable-waveform-surface'] svg text").filter({ hasText: "A5" }).first();
  const evidence = await text.evaluate((element) => {
    const owner = element.closest<HTMLElement>("[data-role='stable-waveform-surface']")?.closest<HTMLElement>("[data-testid='cycle-surface']");
    const presentationScale = Number.parseFloat(getComputedStyle(owner ?? element).getPropertyValue("--presentation-x-scale"));
    const scale = getComputedStyle(element).scale.split(/\s+/).map(Number)[0];
    return { presentationScale, textScale: scale, textRect: element.getBoundingClientRect().toJSON() };
  });
  expect(evidence.presentationScale).toBeGreaterThan(0);
  expect(evidence.textScale).toBeCloseTo(1 / evidence.presentationScale, 3);
  expect(evidence.textRect.width).toBeGreaterThan(0);
  expect(evidence.textRect.height).toBeGreaterThan(0);
});

test("keeps the cycle ruler sticky and clipped to the time domain during vertical and horizontal scroll", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const viewport = page.getByTestId("cycle-viewport");
  const ruler = page.getByTestId("cycle-ruler");
  const frozen = host.locator("[data-role='frozen-label-rows']");
  const before = await page.evaluate(() => ({
    canonical: document.querySelector<HTMLElement>("[data-testid='cycle-surface']")?.dataset.canonicalRevision,
    history: document.querySelector<HTMLElement>("[data-testid='cycle-surface']")?.dataset.historyDepth,
    dirty: document.querySelector<HTMLElement>("[data-testid='dirty-status']")?.textContent,
  }));
  const initial = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
    const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
    const tick = ruler.querySelector<HTMLElement>("[data-cycle='3']")!;
    return { viewport: viewport.getBoundingClientRect().toJSON(), ruler: ruler.getBoundingClientRect().toJSON(), tick: tick.getBoundingClientRect().toJSON(), maxLeft: viewport.scrollWidth - viewport.clientWidth, maxTop: viewport.scrollHeight - viewport.clientHeight };
  });
  expect(initial.maxTop).toBeGreaterThan(0);
  expect(initial.maxLeft).toBeGreaterThan(0);
  const scroll = await viewport.evaluate((element) => {
    element.scrollLeft = Math.min(120, element.scrollWidth - element.clientWidth);
    element.scrollTop = Math.min(120, element.scrollHeight - element.clientHeight);
    element.dispatchEvent(new Event("scroll"));
    return { left: element.scrollLeft, top: element.scrollTop };
  });
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
    const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
    const frozen = document.querySelector<HTMLElement>("[data-role='frozen-label-rows']")!;
    const tick = ruler.querySelector<HTMLElement>("[data-cycle='3']")!;
    const rulerRect = ruler.getBoundingClientRect();
    const tickRect = tick.getBoundingClientRect();
    return {
      viewport: viewport.getBoundingClientRect().toJSON(),
      ruler: rulerRect.toJSON(),
      frozen: frozen.getBoundingClientRect().toJSON(),
      tick: tickRect.toJSON(),
      tickVisibleWidth: Math.max(0, Math.min(tickRect.right, rulerRect.right) - Math.max(tickRect.left, rulerRect.left)),
    };
  });
  expect(Math.abs(after.ruler.y - after.viewport.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.ruler.left - after.frozen.right)).toBeLessThanOrEqual(1);
  expect(Math.abs((after.tick.x - initial.tick.x) + scroll.left)).toBeLessThanOrEqual(1);
  expect(after.tickVisibleWidth).toBeGreaterThan(0);
  expect(Math.abs(after.ruler.width - initial.ruler.width)).toBeLessThanOrEqual(1);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.canonical);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  await expect(frozen).toBeVisible();
});

test("keeps ruler clipping and frozen-column ownership through scroll positions and zoom presets", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const viewport = page.getByTestId("cycle-viewport");
  const ruler = page.getByTestId("cycle-ruler");
  const frozen = host.locator("[data-role='frozen-label-rows']");
  for (const zoom of ["50", "100", "150", "200"]) {
    await page.getByLabel("Zoom preset").selectOption(zoom);
    for (const fraction of [0, 0.5, 1]) {
      await viewport.evaluate((element, position) => {
        const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
        const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
        element.scrollLeft = Math.round(maxLeft * position);
        element.scrollTop = Math.round(maxTop * position);
        element.dispatchEvent(new Event("scroll"));
        return { left: element.scrollLeft, top: element.scrollTop };
      }, fraction);
      await page.waitForTimeout(50);
      const geometry = await page.evaluate(() => {
        const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
        const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
        const frozen = document.querySelector<HTMLElement>("[data-role='frozen-label-rows']")!;
        const content = ruler.querySelector<HTMLElement>(".cycle-ruler-content")!;
        const ticks = ["0", "10", "24"].map((cycle) => ruler.querySelector<HTMLElement>(`[data-cycle='${cycle}']`)!.getBoundingClientRect().toJSON());
        return {
          viewport: viewport.getBoundingClientRect().toJSON(),
          ruler: ruler.getBoundingClientRect().toJSON(),
          frozen: frozen.getBoundingClientRect().toJSON(),
          ticks,
          contentOverflow: getComputedStyle(ruler).overflow,
          contentTransform: getComputedStyle(content).transform,
        };
      });
      expect(Math.abs(geometry.ruler.y - geometry.viewport.y), `zoom=${zoom} fraction=${fraction}`).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.ruler.left - geometry.frozen.right), `zoom=${zoom} fraction=${fraction}`).toBeLessThanOrEqual(1);
      expect(geometry.contentOverflow).toBe("hidden");
      const visibleTicks = geometry.ticks.filter((tick) => Math.min(tick.right, geometry.ruler.right) - Math.max(tick.left, geometry.ruler.left) > 0);
      expect(visibleTicks.length, `zoom=${zoom} fraction=${fraction}`).toBeGreaterThan(0);
    }
  }
});
