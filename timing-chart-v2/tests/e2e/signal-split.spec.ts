import { expect, test } from "@playwright/test";

// Signal Split View (#200) PR 3/4: dual-viewport DOM/scroll-sync structure.
// Lower is an empty placeholder in this PR -- no renderer/projection mounts
// into it yet (real per-signal pane routing is PR 4) -- so these tests only
// cover the DOM/scroll mechanics this PR actually delivers: the toggle is
// view-only, Upper/Lower scroll vertically independently, and horizontal
// scroll/zoom stay synchronized between the two panes' rulers.

test("toggling Signal Split is view-only and Upper's own scroll position survives toggling Lower off and back on", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const toggle = page.getByTestId("view-panel-signal-split");
  await expect(page.getByTestId("cycle-viewport-lower")).toHaveCount(0);

  await toggle.click();
  await expect(page.getByTestId("cycle-viewport-lower")).toBeVisible();
  await expect(page.getByTestId("cycle-surface-lower")).toBeVisible();
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);

  const viewport = page.getByTestId("cycle-viewport");
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  await viewport.evaluate((element) => { element.scrollLeft = 60; element.dispatchEvent(new Event("scroll")); });
  await expect(page.getByTestId("cycle-ruler-lower").locator(".cycle-ruler-content")).toHaveCSS("transform", await page.getByTestId("cycle-ruler").locator(".cycle-ruler-content").evaluate((element) => getComputedStyle(element).transform));

  await toggle.click();
  await expect(page.getByTestId("cycle-viewport-lower")).toHaveCount(0);
  await expect(viewport).toHaveJSProperty("scrollLeft", 60);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
});

test("Upper and Lower scroll vertically independently while sharing one horizontal time domain", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  const upper = page.getByTestId("cycle-viewport");
  const lower = page.getByTestId("cycle-viewport-lower");
  await expect(lower).toBeVisible();

  // Independent vertical scroll: scrolling Upper never moves Lower's own scrollTop.
  await upper.evaluate((element) => { element.scrollTop = 30; element.dispatchEvent(new Event("scroll")); });
  await expect(lower).toHaveJSProperty("scrollTop", 0);
  await expect(upper).toHaveJSProperty("scrollTop", 30);

  // Shared horizontal domain: Lower's ruler mirrors Upper's horizontal
  // transform exactly (Lower's own scrollLeft isn't independently
  // meaningful yet -- its placeholder content has no real scrollable
  // width until PR 4 gives it matching rows).
  await upper.evaluate((element) => { element.scrollLeft = 45; element.dispatchEvent(new Event("scroll")); });
  const upperTransformAfterScroll = await page.getByTestId("cycle-ruler").locator(".cycle-ruler-content").evaluate((element) => getComputedStyle(element).transform);
  await expect(page.getByTestId("cycle-ruler-lower").locator(".cycle-ruler-content")).toHaveCSS("transform", upperTransformAfterScroll);

  // Shared zoom: zooming updates both panes' ruler scale in lockstep.
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  const upperTransform = await page.getByTestId("cycle-ruler").locator(".cycle-ruler-content").evaluate((element) => getComputedStyle(element).transform);
  const lowerTransform = await page.getByTestId("cycle-ruler-lower").locator(".cycle-ruler-content").evaluate((element) => getComputedStyle(element).transform);
  expect(lowerTransform).toBe(upperTransform);
});
