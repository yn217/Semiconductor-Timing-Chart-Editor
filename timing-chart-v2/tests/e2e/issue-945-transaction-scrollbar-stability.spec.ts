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

test("Transaction scroll owner geometry is stable while idle at every window height (no scrollbar oscillation)", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.locator("[data-testid='cycle-viewport']").waitFor();
  await page.waitForTimeout(1500);

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
  for (let height = 700; height <= 1000; height += 4) {
    await page.setViewportSize({ width: 1672, height });
    await page.waitForTimeout(250);
    const result = await sample(450);
    expect(result.id, `viewport element was replaced at height ${height}`).toBe(true);
    // One recorded state (the initial read) is the stable outcome; more means the geometry kept changing while idle.
    if (result.changes > 1) unstable.push(`h=${height}: ${result.changes} changes ${result.states.join(" | ")}`);
  }
  expect(unstable, unstable.join("\n")).toEqual([]);

  // A filled track fits exactly: no horizontal overflow beyond rounding at the sampled height range's end state.
  const fit = await page.evaluate(() => { const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!; return viewport.scrollWidth - viewport.clientWidth; });
  expect(fit).toBeLessThanOrEqual(1);
});
