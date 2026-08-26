import { expect, test } from "@playwright/test";

test("reorders row shells without rerendering or moving heavy WaveDrom SVG owners", async ({ page }) => {
  await page.goto("/?probe=stable");
  await expect(page.getByText("Phase 5 Stable Waveform Surface probe")).toBeVisible();
  const host = page.getByTestId("surface-host");
  await expect(host).toHaveAttribute("data-phase5-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");

  const ids = async (role: string) => surface.locator(`[data-role='${role}'] > [data-role$='-row'][data-row-id]`).evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  expect(await ids("left-tree-rows")).toEqual(["sig_phase4_clock", "sig_phase3_probe"]);
  expect(await ids("frozen-label-rows")).toEqual(["sig_phase4_clock", "sig_phase3_probe"]);
  expect(await ids("timing-semantic-rows")).toEqual(["sig_phase4_clock", "sig_phase3_probe"]);
  await expect(surface).toHaveAttribute("data-canonical-row-ids", "sig_phase4_clock,sig_phase3_probe");

  const clockSvg = await surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase4_clock'] > svg").elementHandle();
  const probeSvg = await surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase3_probe'] > svg").elementHandle();
  expect(clockSvg).not.toBeNull();
  expect(probeSvg).not.toBeNull();
  const initialOwnerOrder = await surface.locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.map((owner) => (owner as HTMLElement).dataset.signalId));
  expect(initialOwnerOrder).toEqual(["sig_phase4_clock", "sig_phase3_probe"]);
  expect(JSON.parse(await surface.getAttribute("data-render-counters") ?? "null")).toEqual({ waveDromRenders: 2, localGeometryBuilds: 2, rowPositionUpdates: 2, overlayUpdates: 0 });

  await page.getByTestId("viewport").click();
  await expect(host).toHaveAttribute("data-viewport", "narrow");
  await expect(surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase3_probe']")).toHaveCount(0);
  expect(JSON.parse(await surface.getAttribute("data-render-counters") ?? "null")).toEqual({ waveDromRenders: 2, localGeometryBuilds: 2, rowPositionUpdates: 2, overlayUpdates: 0 });
  await page.getByTestId("viewport").click();
  await expect(host).toHaveAttribute("data-viewport", "expanded");
  const remountedProbeSvg = await surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase3_probe'] > svg").elementHandle();
  expect(await probeSvg!.evaluate((before, after) => before === after, remountedProbeSvg)).toBe(true);
  expect(JSON.parse(await surface.getAttribute("data-render-counters") ?? "null")).toEqual({ waveDromRenders: 2, localGeometryBuilds: 2, rowPositionUpdates: 2, overlayUpdates: 0 });

  await page.getByTestId("reorder").click();
  await expect(host).toHaveAttribute("data-reordered", "true");
  expect(await ids("left-tree-rows")).toEqual(["sig_phase3_probe", "sig_phase4_clock"]);
  expect(await ids("frozen-label-rows")).toEqual(["sig_phase3_probe", "sig_phase4_clock"]);
  expect(await ids("timing-semantic-rows")).toEqual(["sig_phase3_probe", "sig_phase4_clock"]);
  await expect(surface).toHaveAttribute("data-canonical-row-ids", "sig_phase3_probe,sig_phase4_clock");

  const finalOwnerOrder = await surface.locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.map((owner) => (owner as HTMLElement).dataset.signalId));
  expect(finalOwnerOrder).toEqual(initialOwnerOrder);
  const currentClockSvg = await surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase4_clock'] > svg").elementHandle();
  const currentProbeSvg = await surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase3_probe'] > svg").elementHandle();
  expect(await clockSvg!.evaluate((before, after) => before === after, currentClockSvg)).toBe(true);
  expect(await probeSvg!.evaluate((before, after) => before === after, currentProbeSvg)).toBe(true);
  expect(JSON.parse(await surface.getAttribute("data-render-counters") ?? "null")).toEqual({ waveDromRenders: 2, localGeometryBuilds: 2, rowPositionUpdates: 4, overlayUpdates: 0 });
  await expect(surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase3_probe']")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 32)");
  await expect(surface.locator("[data-role='wave-owner'][data-signal-id='sig_phase4_clock']")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 66)");
});
