import { expect, test } from "@playwright/test";

test("keeps WaveDrom DOM writes and Local Geometry reads inside one render batch", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const surface = host.locator("[data-role='timing-chart-surface']");
  const owners = surface.locator("[data-role='stable-waveform-surface'] > [data-role='wave-owner']");
  await expect(owners.first()).toBeVisible();
  const evidence = await owners.evaluateAll((elements) => {
    const batchIds = new Set(elements.map((element) => (element as HTMLElement).dataset.waveBatchId));
    const batchSizes = elements.map((element) => Number((element as HTMLElement).dataset.waveBatchSize));
    return {
      ownerCount: elements.length,
      batchIds: [...batchIds],
      batchSizes,
      hasSvg: elements.every((element) => element.querySelector("svg") !== null),
    };
  });

  expect(evidence.ownerCount).toBeGreaterThan(1);
  expect(evidence.batchIds).toHaveLength(1);
  expect(evidence.batchIds[0]).toBeTruthy();
  expect(evidence.batchSizes).toEqual(evidence.batchSizes.map(() => evidence.ownerCount));
  expect(evidence.hasSvg).toBe(true);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  const counters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as { waveDromRenders: number; localGeometryBuilds: number };
  expect(counters.waveDromRenders).toBe(evidence.ownerCount);
  expect(counters.localGeometryBuilds).toBe(evidence.ownerCount);
});
