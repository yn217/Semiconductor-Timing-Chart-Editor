import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { hoverTimelineArea, timelineScrollLeft } from "./timeline-scroll.js";

// #738 stress with REAL input: wheel bursts and native scrollbar thumb drags, alternating right and back to the left 40 times.
// After every gesture: scrollLeft is finite and the ruler's tick offset (tick.left - (cycle*px - scrollLeft)) equals its value at rest,
// the rendered window covers the visible cycles (SVG), and at scrollLeft 0 the first ruler cell is cycle 0.
// Default is a bounded smoke (fast enough for the regular suite); STRESS738=1 runs the full 20-30 round matrix used to investigate #738.
const FULL = process.env.STRESS738 === "1";
const ROUNDS = { svg: FULL ? 20 : 6, canvas: FULL ? 30 : 8 } as const;
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const settle = async (page: Page) => {
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
};
const state = (page: Page) => page.evaluate(() => {
  const owner = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
  const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
  const frameLeft = ruler.getBoundingClientRect().left; const right = owner.getBoundingClientRect().right;
  const ticks = Array.from(ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]")).map((t) => ({ cycle: Number(t.dataset.sourceCycle), x: t.getBoundingClientRect().left })).filter((t) => t.x >= frameLeft - 1 && t.x <= right).sort((a, b) => a.x - b.x);
  const first = ticks[0]; const second = ticks.find((t) => t.cycle > (first?.cycle ?? 0));
  const windows = Array.from(document.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-rendered-source-window-start]")).slice(0, 3).map((el) => [Number(el.dataset.renderedSourceWindowStart), Number(el.dataset.renderedSourceWindowEnd)]);
  const bar = document.querySelector<HTMLElement>("[data-testid='timeline-hscroll']");
  const barRect = bar?.getBoundingClientRect();
  return { scrollLeft: owner.scrollLeft, scrollWidth: owner.scrollWidth, clientWidth: owner.clientWidth, first, px: first && second ? (second.x - first.x) / (second.cycle - first.cycle) : undefined, frameLeft, ticks: ticks.length, windows, bar: barRect ? { left: barRect.left, top: barRect.top, width: barRect.width, height: barRect.height, hidden: bar!.hidden } : undefined };
});

for (const wave of ["svg", "canvas"] as const) {
  test(`wheel and native thumb drags right<->left x30 keep the ruler origin and render window consistent (${wave})`, async ({ page }) => {
    test.setTimeout(400_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto(`/?wave=${wave}`);
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const document = generatePerformanceDocument({ signalCount: 12, cycleCount: wave === "svg" ? 1_200 : 2_500, profile: "transaction-heavy" });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "stress738b.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await settle(page);
    const revision = await surface.getAttribute("data-canonical-revision");
    const rest = await state(page);
    const offset0 = rest.first!.x - rest.frameLeft - (rest.first!.cycle * rest.px! - rest.scrollLeft);
    const trace: string[] = []; const failures: string[] = [];
    const check = async (label: string) => {
      await settle(page);
      const s = await state(page);
      const off = s.first && s.px ? s.first.x - s.frameLeft - (s.first.cycle * s.px - s.scrollLeft) : offset0;
      const pxUse = s.px ?? rest.px!;
      const vs = s.scrollLeft / pxUse; const ve = (s.scrollLeft + s.clientWidth) / pxUse;
      trace.push(`${label} left=${s.scrollLeft}/${s.scrollWidth - s.clientWidth} tick=${s.first?.cycle} off=${(off - offset0).toFixed(2)} ticks=${s.ticks} win=${JSON.stringify(s.windows)} bar=${s.bar ? `${Math.round(s.bar.left)},${Math.round(s.bar.width)}` : "-"}`);
      if (!Number.isFinite(s.scrollLeft)) failures.push(`${label}: scrollLeft not finite`);
      if (Math.abs(off - offset0) > 2) failures.push(`${label}: ruler origin moved by ${(off - offset0).toFixed(2)}px`);
      if (s.ticks < 1) failures.push(`${label}: blank ruler`);
      if (s.scrollLeft === 0 && s.first?.cycle !== 0) failures.push(`${label}: at 0 the first ruler cell is ${s.first?.cycle}`);
      if (wave === "svg") for (const [a, b] of s.windows) if (Number.isFinite(a) && (a > vs + 1 || b < ve - 1)) failures.push(`${label}: rendered [${a},${b}] does not cover visible [${vs.toFixed(0)},${ve.toFixed(0)}]`);
      return s;
    };
    await hoverTimelineArea(page);
    for (let round = 0; round < ROUNDS[wave]; round += 1) {
      if (round % 2 === 0) {
        // Wheel burst right then a partial burst back left (right->left rebase), then a full return every 5th round.
        for (let i = 0; i < 6; i += 1) await page.mouse.wheel(900, 0);
        await check(`w${round}→`);
        for (let i = 0; i < 3 + (round % 4); i += 1) await page.mouse.wheel(-1100, 0);
        await check(`w${round}←`);
      } else {
        // Native scrollbar thumb drag: right, then back to the far left.
        const g = await state(page);
        if (!g.bar || g.bar.hidden) { failures.push(`t${round}: scrollbar hidden`); continue; }
        const ARROW = 17; const y = g.bar.top + g.bar.height / 2; const track = g.bar.width - 2 * ARROW;
        const thumbW = Math.max(20, (g.clientWidth / g.scrollWidth) * track);
        const thumbX = () => state(page).then((z) => g.bar!.left + ARROW + (z.scrollLeft / (z.scrollWidth - z.clientWidth)) * (track - thumbW) + thumbW / 2);
        for (const fraction of [0.6, 0.15, 0]) {
          const startX = await thumbX(); const endX = g.bar.left + ARROW + thumbW / 2 + fraction * (track - thumbW);
          await page.mouse.move(startX, y); await page.mouse.down();
          for (let step = 1; step <= 6; step += 1) await page.mouse.move(startX + ((endX - startX) * step) / 6, y);
          await page.mouse.up();
          await check(`t${round}@${fraction}`);
        }
      }
    }
    console.log(`738 real-input ${wave}: ${trace.length} checks, ${failures.length} violations\n${trace.slice(-5).join("\n")}`);
    expect(failures, `${failures.join("\n")}\n--- trace ---\n${trace.join("\n")}`).toEqual([]);
    expect(errors).toEqual([]);
    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    expect(await timelineScrollLeft(page)).toBeGreaterThanOrEqual(0);
  });
}
