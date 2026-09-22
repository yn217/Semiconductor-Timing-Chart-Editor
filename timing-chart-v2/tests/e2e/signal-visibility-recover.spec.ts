import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("hiding a signal keeps its navigation row recoverable while removing its waveform row", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const id = "sig_cycle_request";
  const left = surface.locator(`[data-role='left-row'][data-row-id='${id}']`);
  const frozen = surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`);
  const timing = surface.locator(`[data-role='timing-row'][data-row-id='${id}']`);
  const wave = surface.locator(`[data-role='wave-owner'][data-signal-id='${id}']`);
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeHistory = await host.getAttribute("data-history-depth");
  const canonicalRows = await surface.getAttribute("data-canonical-row-ids");
  const beforeGroup = await left.getAttribute("data-group-id");
  const unaffected = surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_ready']");
  await expect(left.locator("[data-role='tree-visibility']")).toHaveAttribute("aria-pressed", "true");

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await left.locator("[data-role='tree-visibility']").click();
    await expect(left).toBeVisible();
    await expect(left.locator("[data-role='tree-visibility']")).toBeVisible();
    await expect(left.locator("[data-role='tree-visibility']")).toHaveAttribute("aria-pressed", "false");
    // Hidden signals stay recoverable via their Left Tree row (checked
    // above/below), but the Frozen label row -- like Timing/Wave -- is
    // removed rather than kept visible; see reorder-visibility.spec.ts's
    // "hides and restores a selected signal" test for the same contract.
    await expect(frozen).toHaveCount(0);
    await expect(timing).toHaveCount(0);
    await expect(wave).toHaveCount(0);
    await expect(unaffected).toBeVisible();
    expect(await surface.getAttribute("data-canonical-row-ids")).toBe(canonicalRows);
    expect(await left.getAttribute("data-group-id")).toBe(beforeGroup);
    await left.locator("[data-role='tree-visibility']").click();
    await expect(left).toBeVisible();
    await expect(timing).toBeVisible();
    await expect(wave).toHaveCount(1);
    await expect(left.locator("[data-role='tree-visibility']")).toHaveAttribute("aria-pressed", "true");
  }
  expect(await host.getAttribute("data-canonical-revision")).not.toBe(beforeRevision);
  expect(await host.getAttribute("data-history-depth")).not.toBe(beforeHistory);
});
