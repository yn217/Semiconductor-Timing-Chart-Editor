import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function readState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const minimap = document.querySelector<HTMLElement>("[data-testid='minimap']")!;
    const host = document.querySelector<HTMLElement>("[data-testid='cycle-surface']")!;
    const surface = document.querySelector<HTMLElement>("[data-role='timing-chart-surface']")!;
    return {
      overviewBuilds: minimap.dataset.overviewBuilds,
      signalLookups: minimap.dataset.overviewSignalLookups,
      overviewReuseSignalComparisons: minimap.dataset.overviewReuseSignalComparisons,
      overviewRows: minimap.querySelectorAll(".minimap-rows > span").length,
      viewportLeft: minimap.dataset.viewportLeft,
      viewportTop: minimap.dataset.viewportTop,
      session: JSON.parse(host.dataset.sessionCounters ?? "null") as Record<string, number>,
      render: JSON.parse(surface.dataset.renderCounters ?? "null") as Record<string, number>,
      revision: host.dataset.canonicalRevision,
      history: document.querySelector<HTMLElement>("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector<HTMLElement>("[data-testid='dirty-status']")?.textContent,
    };
  });
}

test("Bookmark-only document commits do not compare the unchanged MiniMap Signal collection", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  // The static overview is built in an idle callback after ready; read baselines only once it exists.
  await expect(page.getByTestId("minimap")).toHaveAttribute("aria-busy", "false");
  const before = await readState(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("0");
  await page.getByLabel("Timeline range end").fill("1");
  await page.getByTestId("timeline-editor").getByRole("button", { name: "Add marker", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = await readState(page);
  expect(after.revision).not.toBe(before.revision);
  expect(after.overviewBuilds).toBe(before.overviewBuilds);
  expect(after.overviewReuseSignalComparisons).toBe(before.overviewReuseSignalComparisons);
  expect(after.history).not.toBe(before.history);
  expect(after.dirty).not.toBe(before.dirty);
});

test("MiniMap viewport updates do not rebuild the static overview", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  // The static overview is built in an idle callback after ready; read baselines only once it exists.
  await expect(page.getByTestId("minimap")).toHaveAttribute("aria-busy", "false");
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
  await expect.poll(() => minimap.getAttribute("data-viewport-left")).not.toBe(before.viewportLeft);
  await expect.poll(() => minimap.getAttribute("data-viewport-top")).not.toBe(before.viewportTop);
  const afterScroll = await readState(page);
  expect(afterScroll.overviewBuilds).toBe(before.overviewBuilds);
  expect(afterScroll.signalLookups).toBe(before.signalLookups);
  expect(afterScroll.overviewRows).toBe(before.overviewRows);

  const box = await minimap.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await expect.poll(() => minimap.getAttribute("data-viewport-left")).not.toBe(afterScroll.viewportLeft);
  await expect.poll(() => minimap.getAttribute("data-viewport-top")).not.toBe(afterScroll.viewportTop);
  const afterPan = await readState(page);
  expect(afterPan.overviewBuilds).toBe(before.overviewBuilds);
  expect(afterPan.signalLookups).toBe(before.signalLookups);
  expect(afterPan.overviewRows).toBe(before.overviewRows);
  expect(afterPan.revision).toBe(before.revision);
  for (const key of ["validationRuns", "commits", "commandAttempts", "committedActions", "undoOperations", "redoOperations"]) {
    expect(afterPan.session[key]).toBe(before.session[key]);
  }
  // Direct scrolling above can legitimately window/remount waveform content.
  // The MiniMap pan itself must not trigger another render beyond that settled scroll.
  expect(afterPan.render.waveDromRenders).toBe(afterScroll.render.waveDromRenders);
  expect(afterPan.render.localGeometryBuilds).toBe(afterScroll.render.localGeometryBuilds);
  expect(afterPan.history).toBe(before.history);
  expect(afterPan.dirty).toBe(before.dirty);
});

test("non-overview Signal property commits reuse the static MiniMap overview", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  // The static overview is built in an idle callback after ready; read baselines only once it exists.
  await expect(page.getByTestId("minimap")).toHaveAttribute("aria-busy", "false");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const minimap = page.getByTestId("minimap");
  const before = await readState(page);
  await page.getByTestId("inspector").locator("input[aria-label='Inspector signal name']").fill("REQUEST_RENAMED");
  await page.getByTestId("inspector").locator("input[aria-label='Inspector signal name']").press("Enter");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = await readState(page);
  expect(after.overviewBuilds).toBe(before.overviewBuilds);
  expect(after.signalLookups).toBe(before.signalLookups);
  expect(after.overviewRows).toBe(before.overviewRows);
  expect(after.revision).not.toBe(before.revision);
  expect(after.history).not.toBe(before.history);
  expect(after.dirty).not.toBe(before.dirty);
  await expect(minimap).toHaveAttribute("data-overview-builds", before.overviewBuilds!);
});
