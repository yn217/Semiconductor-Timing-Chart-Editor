import { expect, test } from "@playwright/test";

/**
 * #945: standalone Transaction's native scrollbars must not oscillate. The ruler/track width used to be clientWidth + the WaveDrom
 * margins, so the content was always a few px wider than the viewport: a phantom horizontal scrollbar, whose height forced a vertical
 * one when the content height sat near the threshold, whose width shrank clientWidth, which rebuilt the track narrower... every frame.
 *
 * Real (non-overlay) scrollbars are required to see the feedback, so this spec keeps Chromium's scrollbars enabled, then sweeps the
 * window height across the threshold and counts geometry changes per rAF.
 */
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function sweep(page: import("@playwright/test").Page, { step, settleMs, sampleMs }: { step: number; settleMs: number; sampleMs: number }): Promise<void> {
  const sample = (durationMs: number) => page.evaluate((duration) => new Promise<{ changes: number; frames: number; states: string[]; id: boolean }>((resolve) => {
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
    const states = new Set<string>(); let previous = ""; let changes = 0; let frames = 0; const start = performance.now();
    const tick = () => {
      const current = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']");
      const key = `cw${viewport.clientWidth}/ch${viewport.clientHeight}/sw${viewport.scrollWidth}/sh${viewport.scrollHeight}`;
      if (key !== previous) { changes += 1; previous = key; states.add(key); }
      frames += 1;
      if (performance.now() - start < duration) requestAnimationFrame(tick);
      else resolve({ changes, frames, states: [...states].slice(0, 4), id: current === viewport });
    };
    requestAnimationFrame(tick);
  }), durationMs);

  const unstable: string[] = [];
  for (let height = 700; height <= 1000; height += step) {
    await page.setViewportSize({ width: 1672, height });
    await page.waitForTimeout(settleMs);
    const result = await sample(sampleMs);
    expect(result.id, `viewport element was replaced at height ${height}`).toBe(true);
    // One recorded state (the initial read) is the stable outcome; more means the geometry kept changing while idle.
    if (result.changes > 1) unstable.push(`h=${height}: ${result.changes} changes ${result.states.join(" | ")}`);
  }
  expect(unstable, unstable.join("\n")).toEqual([]);

  // A filled track fits exactly: no horizontal overflow beyond rounding at the sampled height range's end state.
  const fit = await page.evaluate(() => { const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!; return viewport.scrollWidth - viewport.clientWidth; });
  expect(fit).toBeLessThanOrEqual(1);
}

test("Transaction scroll owner geometry is stable while idle across the window-height threshold (quick sweep)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.locator("[data-testid='cycle-viewport']").waitFor();
  await page.waitForTimeout(1000);
  await sweep(page, { step: 30, settleMs: 200, sampleMs: 350 });
});

// Exhaustive 4 px sweep (76 heights, ~1 min): integration tier only; the quick sweep above guards routine PRs.
test("Transaction scroll owner geometry is stable while idle at every window height (no scrollbar oscillation)", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.locator("[data-testid='cycle-viewport']").waitFor();
  await page.waitForTimeout(1500);
  await sweep(page, { step: 4, settleMs: 250, sampleMs: 450 });
});
