import { expect, test } from "@playwright/test";

async function readState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const minimap = document.querySelector<HTMLElement>("[data-testid='minimap']")!;
    const host = document.querySelector<HTMLElement>("[data-testid='cycle-surface']")!;
    const surface = document.querySelector<HTMLElement>("[data-role='timing-chart-surface']")!;
    return {
      overviewBuilds: minimap.dataset.overviewBuilds,
      signalLookups: minimap.dataset.overviewSignalLookups,
      overviewRows: minimap.querySelectorAll(".minimap-rows > span").length,
      session: JSON.parse(host.dataset.sessionCounters ?? "null") as Record<string, number>,
      render: JSON.parse(surface.dataset.renderCounters ?? "null") as Record<string, number>,
      revision: host.dataset.canonicalRevision,
      history: document.querySelector<HTMLElement>("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector<HTMLElement>("[data-testid='dirty-status']")?.textContent,
    };
  });
}

test("MiniMap viewport updates do not rebuild the static overview", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const minimap = page.getByTestId("minimap");
  const before = await readState(page);
  expect(Number(before.overviewBuilds)).toBeGreaterThan(0);
  expect(Number(before.signalLookups)).toBeGreaterThan(0);
  expect(before.overviewRows).toBeGreaterThan(0);
  await expect(minimap.locator(".minimap-rows > span").first()).toBeVisible();

  await page.getByTestId("cycle-viewport").evaluate((element) => {
    element.scrollTop = Math.max(1, element.scrollHeight - element.clientHeight);
    element.scrollLeft = Math.max(1, element.scrollWidth - element.clientWidth);
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(100);
  const afterScroll = await readState(page);
  expect(afterScroll.overviewBuilds).toBe(before.overviewBuilds);
  expect(afterScroll.signalLookups).toBe(before.signalLookups);
  expect(afterScroll.overviewRows).toBe(before.overviewRows);

  const box = await minimap.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.waitForTimeout(50);
  const afterPan = await readState(page);
  expect(afterPan.overviewBuilds).toBe(before.overviewBuilds);
  expect(afterPan.signalLookups).toBe(before.signalLookups);
  expect(afterPan.overviewRows).toBe(before.overviewRows);
  expect(afterPan.revision).toBe(before.revision);
  for (const key of ["validationRuns", "commits", "commandAttempts", "committedActions", "undoOperations", "redoOperations"]) {
    expect(afterPan.session[key]).toBe(before.session[key]);
  }
  expect(afterPan.render.waveDromRenders).toBe(before.render.waveDromRenders);
  expect(afterPan.render.localGeometryBuilds).toBe(before.render.localGeometryBuilds);
  expect(afterPan.history).toBe(before.history);
  expect(afterPan.dirty).toBe(before.dirty);
});
