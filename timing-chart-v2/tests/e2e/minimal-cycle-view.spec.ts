import { expect, test } from "@playwright/test";
import { timelineOwner } from "./timeline-scroll.js";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("projects canonical rows into aligned tree, frozen labels, and waveform surfaces", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Semiconductor Timing Chart" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cycle View" })).toBeVisible();

  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const expected = [
    "sig_cycle_clock", "sig_cycle_reset_n", "sig_cycle_request", "sig_cycle_ready",
    "sig_cycle_valid", "sig_cycle_data", "sig_cycle_result", "sig_cycle_state",
  ];
  const rowIds = async (role: string) => surface.locator(`[data-role='${role}'] > [data-role$='-row'][data-row-id]`).evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  expect(await rowIds("left-tree-rows")).toEqual(expected);
  expect(await rowIds("frozen-label-rows")).toEqual(expected);
  expect(await rowIds("timing-semantic-rows")).toEqual(expected);
  await expect(surface.locator("[data-role='wave-owner'] > svg")).toHaveCount(8);

  for (const id of expected) {
    const positions = await surface.locator(`[data-row-id='${id}'], [data-signal-id='${id}']`).evaluateAll((rows) => rows.map((row) => (row as HTMLElement).style.transform));
    expect(new Set(positions).size, `${id} must use one projected Y position`).toBe(1);
  }
  await expect(surface.locator("[data-role='left-row'][data-group-start='true']")).toHaveCount(2);
  // The role badge carries the Signal type label; the first row is the CLOCK.
  await expect(surface.locator("[data-role='signal-role']").first()).toHaveText("Clock");
});

test("derives the ruler from local geometry and keeps selection view-only", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ruler = page.getByTestId("cycle-ruler");
  await expect(ruler).toHaveAttribute("data-source", "local-geometry");
  const tickPositions = await ruler.locator("[data-cycle]").evaluateAll((ticks) => ticks.map((tick) => Number.parseFloat((tick as HTMLElement).style.left)));
  expect(tickPositions.length).toBeGreaterThanOrEqual(12);
  expect(new Set(tickPositions).size).toBe(tickPositions.length);
  expect(tickPositions.every((position, index) => index === 0 || position > tickPositions[index - 1]!)).toBe(true);

  const countersBefore = await surface.getAttribute("data-render-counters");
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await host.getAttribute("data-history-depth");
  await surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  await expect(host).toHaveAttribute("data-selected-signal-id", "sig_cycle_request");
  await expect(surface.locator("[data-row-id='sig_cycle_request'][data-selected='true']")).toHaveCount(3);
  await expect(surface.locator("[data-signal-id='sig_cycle_request'][data-selected='true']")).toHaveCount(1);
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  expect(await host.getAttribute("data-history-depth")).toBe(historyBefore);
});

test("synchronizes scrolling through one viewport without regenerating waveforms", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const viewport = page.getByTestId("cycle-viewport");
  const countersBefore = await surface.getAttribute("data-render-counters");
  const projectionBefore = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as { fullVisibleRowScans: number; viewportOnlyBuilds: number; rowLayoutBuilds: number };
  const svgBefore = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();

  await timelineOwner(page).evaluate((element) => { element.scrollLeft = 240; element.dispatchEvent(new Event("scroll")); });
  const scroll = await viewport.evaluate((element) => { element.scrollTop = 80; element.dispatchEvent(new Event("scroll")); return { top: element.scrollTop, left: 240 }; });
  expect(scroll.left).toBeGreaterThan(0);
  await expect(host).toHaveAttribute("data-viewport-start-y", String(Math.max(0, scroll.top - 34)));
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);
  const projectionAfter = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as { fullVisibleRowScans: number; viewportOnlyBuilds: number; rowLayoutBuilds: number };
  expect(projectionAfter.fullVisibleRowScans).toBe(projectionBefore.fullVisibleRowScans);
  expect(projectionAfter.viewportOnlyBuilds).toBeGreaterThan(projectionBefore.viewportOnlyBuilds);
  expect(projectionAfter.rowLayoutBuilds).toBe(projectionBefore.rowLayoutBuilds);
  const frozenLeft = await surface.locator("[data-role='frozen-label-rows']").evaluate((element) => Math.round(element.getBoundingClientRect().left));
  const headingLeft = await page.locator(".column-headings > span").nth(1).evaluate((element) => Math.round(element.getBoundingClientRect().left));
  expect(Math.abs(frozenLeft - headingLeft)).toBeLessThanOrEqual(1);

  await timelineOwner(page).evaluate((element) => { element.scrollLeft = 0; });
  await viewport.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
  await expect(host).toHaveAttribute("data-viewport-start-y", "0");
  const svgAfter = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();
  expect(await svgBefore!.evaluate((before, after) => before === after, svgAfter)).toBe(true);
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);
});
