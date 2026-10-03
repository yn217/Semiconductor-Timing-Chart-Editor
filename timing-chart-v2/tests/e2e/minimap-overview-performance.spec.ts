import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";
import { setTimelineScrollLeft } from "./timeline-scroll.js";

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
  // The startup document fits horizontally; open a wide one so the MiniMap viewport really moves in both axes.
  const wide = generatePerformanceDocument({ signalCount: 40, cycleCount: 400, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "wide.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(wide)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("minimap")).toHaveAttribute("aria-busy", "false");
  const minimap = page.getByTestId("minimap");
  const before = await readState(page);
  expect(Number(before.overviewBuilds)).toBeGreaterThan(0);
  expect(Number(before.signalLookups)).toBeGreaterThan(0);
  expect(before.overviewRows).toBeGreaterThan(0);
  await expect(minimap.locator(".minimap-rows > span").first()).toBeVisible();

  await page.getByTestId("cycle-viewport").evaluate(async (element) => {
    element.scrollTop = Math.max(1, element.scrollHeight - element.clientHeight);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await setTimelineScrollLeft(page, 10_000_000);
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
  // A MiniMap pan moves the viewport, so newly exposed rows legitimately render (virtualization); it must stay bounded by the visible
  // window (well under the 40-Signal document) rather than re-rendering the whole document, and must not rebuild the overview.
  expect(afterPan.render.waveDromRenders - afterScroll.render.waveDromRenders).toBeLessThan(40);
  expect(afterPan.render.localGeometryBuilds - afterScroll.render.localGeometryBuilds).toBeLessThan(40);
  expect(afterPan.history).toBe(before.history);
  expect(afterPan.dirty).toBe(before.dirty);
});

for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) test(`non-overview Signal property commits keep the MiniMap continuously visible at ${size.width}x${size.height}`, async ({ page }) => {
  await page.setViewportSize(size);
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  // The static overview is built in an idle callback after ready; read baselines only once it exists.
  await expect(page.getByTestId("minimap")).toHaveAttribute("aria-busy", "false");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const minimap = page.getByTestId("minimap");
  const before = await readState(page);
  expect(before.overviewRows).toBeGreaterThan(0);
  await page.getByTestId("inspector").locator("input[aria-label='Inspector signal name']").fill("REQUEST_RENAMED");
  await page.evaluate(() => {
    const state = window as typeof window & { __minimapContinuitySamples?: Array<{ readonly busy: string | null; readonly rows: number; readonly builds: string | undefined }>; __minimapContinuityActive?: boolean };
    state.__minimapContinuitySamples = [];
    state.__minimapContinuityActive = true;
    const sample = () => {
      const minimap = document.querySelector<HTMLElement>("[data-testid='minimap']");
      state.__minimapContinuitySamples!.push({ busy: minimap?.getAttribute("aria-busy") ?? null, rows: minimap?.querySelectorAll(".minimap-rows > span").length ?? 0, builds: minimap?.dataset.overviewBuilds });
      if (state.__minimapContinuityActive) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByTestId("inspector").locator("input[aria-label='Inspector signal name']").press("Enter");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(minimap).toHaveAttribute("aria-busy", "false");
  const continuity = await page.evaluate(() => {
    const state = window as typeof window & { __minimapContinuitySamples?: Array<{ readonly busy: string | null; readonly rows: number; readonly builds: string | undefined }>; __minimapContinuityActive?: boolean };
    state.__minimapContinuityActive = false;
    return state.__minimapContinuitySamples ?? [];
  });
  expect(continuity.length).toBeGreaterThan(0);
  expect(continuity.every((sample) => sample.busy === "false" && sample.rows > 0 && sample.builds === before.overviewBuilds)).toBe(true);
  const after = await readState(page);
  expect(after.overviewBuilds).toBe(before.overviewBuilds);
  // This reports the cached overview's last derivation, not work performed by this commit.
  // Equality plus an unchanged build count proves the rename reused that same overview.
  expect(after.signalLookups).toBe(before.signalLookups);
  expect(after.overviewRows).toBe(before.overviewRows);
  expect(after.revision).not.toBe(before.revision);
  expect(after.history).not.toBe(before.history);
  expect(after.dirty).not.toBe(before.dirty);
  await expect(minimap).toHaveAttribute("data-overview-builds", before.overviewBuilds!);
});
