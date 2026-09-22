import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #738 deterministic stress harness (seeded). Repeats right->left scroll/rebase sequences and, after every step, records
// { scrollLeft, ruler first visible tick, origin error, rendered source window vs visible cycles } and asserts the invariants:
//   1. the ruler's tick positions agree with cycle * pxPerCycle - scrollLeft (no origin drift after any right->left return),
//   2. the first visible ruler cell is the cell at scrollLeft (never a stale cell),
//   3. (SVG) the rendered source window covers the visible cycles (no blank waveform after a rebase),
//   4. no page error, Canonical/History untouched.
// A failure prints the whole step trace so a user-environment reproduction can be compared against it.
const rng = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; };
// Default = bounded smoke; STRESS738=1 runs the full 50-step x 2-seed matrix used to investigate #738 (400 steps: 0 violations).
const FULL = process.env.STRESS738 === "1";
const STEPS = FULL ? 50 : 20;
const SEEDS = FULL ? ([1, 2] as const) : ([1] as const);

async function open(page: Page, wave: "svg" | "canvas", cycles: number) {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(`/?wave=${wave}`);
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 12, cycleCount: cycles, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "stress738.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  return surface;
}
const settle = async (page: Page) => {
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
};
const snapshot = (page: Page) => page.evaluate(() => {
  const owner = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
  const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
  const frameLeft = ruler.getBoundingClientRect().left;
  const ownerRect = owner.getBoundingClientRect();
  const ticks = Array.from(ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]")).map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left })).filter((t) => t.x >= frameLeft - 1 && t.x <= ownerRect.right).sort((a, b) => a.x - b.x);
  const first = ticks[0]; const second = ticks.find((t) => t.cycle > (first?.cycle ?? 0));
  const px = first && second ? (second.x - first.x) / (second.cycle - first.cycle) : undefined;
  const windows = Array.from(document.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-rendered-source-window-start]")).slice(0, 4).map((el) => [Number(el.dataset.renderedSourceWindowStart), Number(el.dataset.renderedSourceWindowEnd)]);
  return { scrollLeft: owner.scrollLeft, clientWidth: owner.clientWidth, frameLeft, firstCycle: first?.cycle, firstX: first ? first.x - frameLeft : undefined, px, ticks: ticks.length, windows };
});

for (const wave of ["svg", "canvas"] as const) {
  for (const cycles of [160, 6_000]) for (const seed of SEEDS) {
    test(`ruler origin and rendered window stay consistent over ${STEPS} right->left rebases (${wave}, ${cycles} cycles, seed ${seed})`, async ({ page }) => {
      test.setTimeout(300_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const surface = await open(page, wave, cycles);
      const revision = await surface.getAttribute("data-canonical-revision");
      const history = await page.getByTestId("history-status").innerText();
      const random = rng(738 * seed + cycles);
      const trace: string[] = [];
      const failures: string[] = [];
      const maxScroll = await page.locator("[data-role='timeline-viewport']").evaluate((el) => el.scrollWidth - el.clientWidth);
      let position = 0;
      // Calibration: the tick element's left edge is a constant distance from its boundary; the invariant is that this offset never CHANGES.
      await settle(page);
      const base = await snapshot(page);
      const offset0 = base.firstCycle !== undefined && base.px !== undefined && base.firstX !== undefined ? base.firstX - (base.firstCycle * base.px - base.scrollLeft) : 0;
      for (let step = 0; step < STEPS; step += 1) {
        // Pattern: far jump right, then descending steps (the right->left rebase), periodic full return to 0.
        const phase = step % 5;
        const target = phase === 0 ? Math.floor(random() * maxScroll) : phase === 4 ? 0 : Math.max(0, position - Math.floor(random() * Math.max(600, maxScroll / 6)));
        await page.locator("[data-role='timeline-viewport']").evaluate((el, value) => { el.scrollLeft = value; }, target);
        await settle(page);
        const s = await snapshot(page);
        position = s.scrollLeft;
        const originError = s.firstCycle !== undefined && s.px !== undefined && s.firstX !== undefined ? Math.abs((s.firstX - (s.firstCycle * s.px - s.scrollLeft)) - offset0) : 0;
        const pxPerCycle = s.px ?? base.px ?? 1;
        const visibleStart = s.scrollLeft / pxPerCycle; const visibleEnd = (s.scrollLeft + s.clientWidth) / pxPerCycle;
        trace.push(`#${step} want=${target} got=${s.scrollLeft} ticks=${s.ticks} firstTick=${s.firstCycle}@${s.firstX?.toFixed(1)} px=${s.px?.toFixed(3)} originErr=${originError.toFixed(2)} windows=${JSON.stringify(s.windows)}`);
        if (target <= maxScroll && Math.abs(s.scrollLeft - target) > 1) failures.push(`#${step}: scrollLeft ${s.scrollLeft} != requested ${target}`);
        // Ticks are ~440-480px apart and the Timeline is ~870px wide, so 1-2 visible ticks is normal; ZERO would be a blank ruler.
        if (s.ticks < 1) failures.push(`#${step}: no ruler tick visible at scrollLeft ${s.scrollLeft} (blank ruler)`);
        if (originError > 2) failures.push(`#${step}: ruler origin drift ${originError.toFixed(2)}px`);
        if (s.firstCycle !== undefined && s.px !== undefined && s.firstX !== undefined && s.firstX < -1) failures.push(`#${step}: first visible tick left of the frame (${s.firstX.toFixed(1)})`);
        if (s.scrollLeft === 0 && s.firstCycle !== 0) failures.push(`#${step}: at scrollLeft 0 the first ruler cell is ${s.firstCycle}, not 0`);
        if (wave === "svg") for (const [start, end] of s.windows) if (Number.isFinite(start) && Number.isFinite(end) && (start > visibleStart + 1 || end < visibleEnd - 1)) failures.push(`#${step}: rendered window [${start},${end}] does not cover visible [${visibleStart.toFixed(0)},${visibleEnd.toFixed(0)}]`);
      }
      console.log(`738 stress ${wave}/${cycles}: ${STEPS} steps, ${failures.length} violations\n${trace.slice(-6).join("\n")}`);
      expect(failures, `${failures.join("\n")}\n--- trace ---\n${trace.join("\n")}`).toEqual([]);
      expect(errors).toEqual([]);
      expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
      await expect(page.getByTestId("history-status")).toHaveText(history);
    });
  }
}
