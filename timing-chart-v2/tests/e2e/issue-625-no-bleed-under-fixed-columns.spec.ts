import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const { PNG } = createRequire(import.meta.url)("playwright-core/lib/utilsBundle") as { PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Uint8Array } } } };
/** Pixels that differ visibly (>16/255 in any channel); 1-level anti-aliasing noise is not a bleed. */
const visibleDiff = (a: Buffer, b: Buffer): number => { const x = PNG.sync.read(a); const y = PNG.sync.read(b); let n = 0; for (let i = 0; i < x.data.length; i += 4) if (Math.max(Math.abs(x.data[i]! - y.data[i]!), Math.abs(x.data[i + 1]! - y.data[i + 1]!), Math.abs(x.data[i + 2]! - y.data[i + 2]!)) > 16) n += 1; return n; };

// #625 real-browser acceptance: with a real (classic) native scrollbar drag, nothing from the time domain (grid, waveform, annotation,
// range band, cursor) may show through the fixed columns in any sampled frame, and the fixed columns never move.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`no time-domain pixels under fixed columns during native scrollbar drag at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption("200");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    // A range band (viewport-level) and cursors make the bleed check meaningful.
    await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").click();
    const canon = () => page.evaluate(() => [document.querySelector("[data-testid='revision-status']")?.textContent, document.querySelector("[data-testid='history-status']")?.textContent, document.querySelector("[data-testid='dirty-status']")?.textContent]);
    const canonBefore = await canon();

    const geo = () => page.evaluate(() => {
      const o = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
      const bar = document.querySelector<HTMLElement>("[data-testid='timeline-hscroll']")!;
      const view = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!.getBoundingClientRect();
      const ob = o.getBoundingClientRect(); const bb = bar.getBoundingClientRect(); const fb = document.querySelector("[data-role='frozen-label-rows']")!.getBoundingClientRect(); const lb = document.querySelector("[data-role='left-tree-rows']")!.getBoundingClientRect();
      return { ownerLeft: ob.left, barLeft: bb.left, barRight: bb.right, barBottom: bb.bottom, barH: bar.offsetHeight - bar.clientHeight, barCW: bar.clientWidth, barSW: bar.scrollWidth, fixedRight: fb.right, fixedLeft: lb.left, rowsBottom: Math.max(...Array.from(document.querySelectorAll('[data-role="frozen-row"]')).map((r) => r.getBoundingClientRect().bottom)), viewTop: view.top, viewBottom: view.bottom, ownerScroll: o.scrollLeft, frozenX: fb.left, leftX: lb.left };
    });
    await expect.poll(async () => (await geo()).barSW).toBeGreaterThan(0);
    const g = await geo();
    test.skip(g.barH === 0, "needs a classic scrollbar");
    expect(Math.abs(g.barLeft - g.ownerLeft)).toBeLessThanOrEqual(1);
    expect(g.barLeft).toBeGreaterThanOrEqual(g.fixedRight - 1);

    // Fixed-column strip: everything left of the timeline origin, below the ruler, above the scrollbar.
    const clip = { x: 0, y: Math.round(g.viewTop + 40), width: Math.round(g.fixedRight), height: Math.round(Math.min(g.rowsBottom, g.viewBottom - 20, g.barBottom - 20) - g.viewTop - 40) };
    const reference = await page.screenshot({ clip });
    const ARROW = 17; // classic scrollbar arrow buttons
    const usable = g.barCW - 2 * ARROW;
    const thumb = Math.max(20, usable * g.barCW / g.barSW); const track = usable - thumb;
    const y = g.barBottom - g.barH / 2;
    const startX = g.barLeft + ARROW + thumb / 2;
    const path = [0, 0.25, 0.5, 0.75, 1, 1, 0.5, 0.25, 0];
    await page.mouse.move(startX, y);
    await page.mouse.down();
    let peak = 0;
    try {
      for (const p of path) {
        await page.mouse.move(startX + track * p, y, { steps: 3 });
        await page.waitForTimeout(80);
        const now = await geo();
        peak = Math.max(peak, now.ownerScroll);
        expect(Math.abs(now.frozenX - g.frozenX)).toBeLessThanOrEqual(1);
        expect(Math.abs(now.leftX - g.leftX)).toBeLessThanOrEqual(1);
        expect(Math.abs(now.barLeft - now.ownerLeft)).toBeLessThanOrEqual(1);
        // Nothing from the time domain is the topmost element inside the fixed columns.
        const intruders = await page.evaluate(({ fixedRight, top, bottom }) => {
          const bad: string[] = [];
          for (let x = 4; x < fixedRight; x += 37) for (let yy = top; yy < bottom; yy += 41) {
            const el = document.elementFromPoint(x, yy);
            if (el && !el.closest("[data-role='left-tree-rows'], [data-role='frozen-label-rows'], .column-headings, .left-workspace-rail, .desktop-workspace > .bottom-editor, [data-testid='left-pane-resizer'], [data-testid='frozen-pane-resizer']")) bad.push(`${el.className || el.tagName}@${Math.round(x)},${Math.round(yy)}`);
          }
          return bad;
        }, { fixedRight: g.fixedRight - 2, top: clip.y + 4, bottom: clip.y + clip.height - 4 });
        expect(intruders, `frame ${p}`).toEqual([]);
        const shot = await page.screenshot({ clip });
        expect(visibleDiff(shot, reference), `fixed-column pixels changed at ${p}`).toBe(0);
      }
    } finally { await page.mouse.up(); }
    expect(peak).toBeGreaterThan(0);
    expect(await canon()).toEqual(canonBefore);

    for (const other of ["Transaction", "Combined"]) {
      await page.locator(".view-mode").getByRole("button", { name: other, exact: true }).click();
      await expect(host).toHaveAttribute("data-editor-idle", "true");
      await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
      await expect(host).toHaveAttribute("data-editor-idle", "true");
      await expect.poll(async () => { const n = await geo(); return Math.abs(n.frozenX - g.frozenX) + Math.abs(n.barLeft - n.ownerLeft); }).toBeLessThanOrEqual(2);
      expect(await canon()).toEqual(canonBefore);
    }
  });
}
