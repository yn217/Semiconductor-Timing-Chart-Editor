import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

function rect(locator: import("@playwright/test").Locator) {
  return locator.boundingBox();
}

test("Group Collapse owns only Left Tree disclosure and compacts following tree groups", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const leftInput = surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']");
  const leftPayload = surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload']");
  const frozenInput = surface.locator("[data-role='frozen-group-header'][data-group-id='grp_cycle_control']");
  const frozenPayload = surface.locator("[data-role='frozen-row'][data-group-id='grp_cycle_payload'][data-row-id='sig_cycle_ready']");
  const inputRowIds = await surface.locator("[data-role='left-row'][data-group-id='grp_cycle_control'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await host.getAttribute("data-history-depth");
  const dirty = await page.locator(".save-state").textContent();
  const beforeCounters = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  const beforeLeftPayload = await rect(leftPayload);
  const beforeFrozenPayload = await rect(frozenPayload);

  await leftInput.locator("[data-role='tree-collapse']").click();
  await expect(leftInput.locator("[data-role='tree-collapse']")).toHaveAttribute("aria-expanded", "false");
  await expect(surface.locator("[data-role='left-row'][data-group-id='grp_cycle_control']")).toHaveCount(0);
  await expect(surface.locator("[data-role='frozen-row'][data-group-id='grp_cycle_control']")).not.toHaveCount(0);
  await expect(surface.locator("[data-role='timing-row'][data-group-id='grp_cycle_control']")).not.toHaveCount(0);
  await expect(surface.locator("[data-role='wave-owner'][data-group-id='grp_cycle_control']")).not.toHaveCount(0);
  const afterLeftPayload = await rect(leftPayload);
  const afterFrozenPayload = await rect(frozenPayload);
  expect(afterLeftPayload!.y).toBeLessThan(beforeLeftPayload!.y);
  expect(Math.abs(afterFrozenPayload!.y - beforeFrozenPayload!.y)).toBeLessThanOrEqual(1);
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await host.getAttribute("data-history-depth")).toBe(history);
  expect(await page.locator(".save-state").textContent()).toBe(dirty);
  const afterCounters = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  expect(afterCounters.waveDromRenders).toBe(beforeCounters.waveDromRenders);
  expect(afterCounters.localGeometryBuilds).toBe(beforeCounters.localGeometryBuilds);

  await leftInput.locator("[data-role='tree-collapse']").click();
  await expect(surface.locator("[data-role='left-row'][data-group-id='grp_cycle_control'][data-row-id]")).toHaveCount(inputRowIds.length);
  expect(await surface.locator("[data-role='left-row'][data-group-id='grp_cycle_control'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId))).toEqual(inputRowIds);
});

test("Signal Visibility owns timing presentation independently from collapsed tree disclosure", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const id = "sig_cycle_ready";
  const left = surface.locator(`[data-role='left-row'][data-row-id='${id}']`);
  await surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`).click();
  await left.locator("[data-role='tree-visibility']").click();
  await expect(left.locator("[data-role='tree-visibility']")).toHaveAttribute("aria-pressed", "false");
  await expect(left.locator("[data-role='tree-visibility'] svg")).toHaveAttribute("data-icon", "eye-off");
  await expect(surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`)).toHaveCount(0);
  await expect(surface.locator(`[data-role='timing-row'][data-row-id='${id}']`)).toHaveCount(0);
  await expect(surface.locator(`[data-role='wave-owner'][data-signal-id='${id}']`)).toHaveCount(0);

  const internal = surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload']");
  await internal.locator("[data-role='tree-collapse']").click();
  await expect(left).toHaveCount(0);
  await expect(surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`)).toHaveCount(0);
  await page.getByTestId("inspector").getByLabel("Inspector signal visible").check();
  await page.getByTestId("inspector").getByTestId("apply-inspector-signal").click();
  await expect(surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`)).toHaveCount(1);
  await expect(surface.locator(`[data-role='timing-row'][data-row-id='${id}']`)).toHaveCount(1);
  await expect(surface.locator(`[data-role='wave-owner'][data-signal-id='${id}']`)).toHaveCount(1);
  await expect(left).toHaveCount(0);

  await internal.locator("[data-role='tree-collapse']").click();
  await expect(left).toHaveCount(1);
  await expect(left.locator("[data-role='tree-visibility']")).toHaveAttribute("aria-pressed", "true");
});
