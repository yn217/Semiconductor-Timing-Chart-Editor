import { expect, test } from "@playwright/test";

test("Cycle waveform stays populated during a real sustained horizontal scrollbar drag", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  const baseline = {
    revision: await surface.getAttribute("data-canonical-revision"),
    zoom: await surface.getAttribute("data-zoom"),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
  };

  const viewport = page.getByTestId("cycle-viewport");
  const initial = await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const node = element as HTMLElement;
    return {
      left: rect.left,
      bottom: rect.bottom,
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
      scrollbarHeight: node.offsetHeight - node.clientHeight,
      scrollLeft: node.scrollLeft,
    };
  });
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
  await expect.poll(() => viewport.locator("[data-role='wave-owner'] svg").count(), { timeout: 10_000 }).toBeGreaterThan(0);
  test.skip(initial.scrollbarHeight === 0, "Native scrollbar thumb dragging requires a headed browser; headless Chromium uses a non-interactive overlay scrollbar.");
  // Chromium/Windows may use overlay scrollbars, which do not consume layout
  // height. The native thumb still occupies the bottom scrollbar gutter.
  const thickness = initial.scrollbarHeight || 14;
  const thumbWidth = Math.max(24, initial.clientWidth * initial.clientWidth / initial.scrollWidth);
  const maxScroll = initial.scrollWidth - initial.clientWidth;
  const trackWidth = initial.clientWidth - thumbWidth;
  const y = initial.bottom - thickness / 2;
  const startX = initial.left + thumbWidth / 2;
  const endX = initial.left + trackWidth * 0.82 + thumbWidth / 2;
  console.log(JSON.stringify({ initial, thumbWidth, maxScroll, startX, endX, y }));
  await page.mouse.move(startX, y);
  await page.mouse.down();
  const samples: Array<{ readonly scrollLeft: number; readonly owners: readonly { readonly id: string | undefined; readonly hasSvg: boolean; readonly pathCount: number; readonly range: readonly [string | undefined, string | undefined] }[] }> = [];
  for (let step = 1; step <= 15; step += 1) {
    await page.mouse.move(startX + (endX - startX) * step / 15, y);
    await page.waitForTimeout(150);
    samples.push(await viewport.evaluate((element) => ({
      scrollLeft: (element as HTMLElement).scrollLeft,
      owners: Array.from(element.querySelectorAll<HTMLElement>("[data-role='wave-owner']"), (owner) => ({
        id: owner.dataset.signalId,
        hasSvg: owner.querySelector("svg") !== null,
        pathCount: owner.querySelectorAll("svg path").length,
        range: [owner.dataset.renderedSourceWindowStart, owner.dataset.renderedSourceWindowEnd] as const,
      })),
    })));
  }
  await page.mouse.up();
  await expect.poll(() => viewport.locator("[data-role='wave-owner'] svg").count(), { timeout: 10_000 }).toBeGreaterThan(0);
  const finalScroll = await viewport.evaluate((element) => (element as HTMLElement).scrollLeft);
  const commonWindow = (sample: typeof samples[number]) => sample.owners.every((owner) => owner.range[0] === sample.owners[0]?.range[0] && owner.range[1] === sample.owners[0]?.range[1]);
  console.log(JSON.stringify({ baseline, initial, maxScroll, finalScroll, ownersAtStart: samples[0]?.owners, ownersAtEnd: samples.at(-1)?.owners }));
  expect(finalScroll).toBeGreaterThan(0);
  expect(samples.some((sample) => sample.scrollLeft > 0)).toBe(true);
  expect(samples.every((sample) => sample.owners.length > 0 && sample.owners.every((owner) => owner.hasSvg && owner.pathCount > 0))).toBe(true);
  expect(samples.every(commonWindow)).toBe(true);
  await expect(surface).toHaveAttribute("data-canonical-revision", baseline.revision ?? "0");
  await expect(surface).toHaveAttribute("data-zoom", baseline.zoom ?? "1");
  await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);
});
