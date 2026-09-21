import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// #625 (Cycle): FixedColumns (Signals/Groups, Role, Signal/Annotation) are outside the horizontal scroll owner. The TimelineViewport wrapper
// owns horizontal scroll, its local X starts at 0 and its scrollWidth excludes the fixed widths; the scrollbar track starts at its left edge.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Cycle FixedColumns sit outside the horizontal scroll owner at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.getByTestId("cycle-viewport").evaluate((element) => { (element as HTMLElement).style.setProperty("--wave-width", "4000px"); });
    const bar = page.getByTestId("timeline-hscroll");
    const measure = () => page.evaluate(() => {
      const box = (element: Element) => element.getBoundingClientRect().toJSON();
      const view = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
      const owner = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
      const bar = document.querySelector<HTMLElement>("[data-testid='timeline-hscroll']")!;
      const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
      const frozen = document.querySelector<HTMLElement>("[data-role='frozen-label-rows']")!;
      const left = document.querySelector<HTMLElement>("[data-role='left-tree-rows']")!;
      const rows = Array.from(document.querySelectorAll("[data-role='frozen-row']")).slice(0, 4).map((row) => { const b = row.getBoundingClientRect(); return [b.y, b.height]; });
      return {
        owner: box(owner), bar: bar.getBoundingClientRect().toJSON(), barHidden: bar.hidden, ruler: box(ruler), frozen: box(frozen), left: box(left), view: box(view), rows,
        ownerScrollWidth: owner.scrollWidth, ownerClientWidth: owner.clientWidth, viewScrollWidth: view.scrollWidth, viewClientWidth: view.clientWidth,
        fixedInsideOwner: owner.contains(frozen) || owner.contains(left), ownerOverflowX: getComputedStyle(owner).overflowX,
      };
    });
    // The track re-lays out on the next observer tick after the width change.
    await expect.poll(async () => { const m = await measure(); return Math.abs(m.bar.width - m.owner.width) <= 1 && !m.barHidden && m.owner.right <= m.view.right + 1; }).toBe(true);
    const before = await measure();
    // Structure: fixed columns are not descendants of the horizontal overflow element; the shared viewport does not scroll horizontally.
    expect(before.fixedInsideOwner).toBe(false);
    expect(before.ownerOverflowX).toBe("scroll");
    // The scroll extent is the Timeline's own: fixed widths are not part of it, and the owner starts where the fixed columns end.
    expect(before.ownerScrollWidth).toBeGreaterThan(before.ownerClientWidth);
    expect(Math.abs(before.owner.left - before.frozen.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(before.owner.left - before.ruler.left)).toBeLessThanOrEqual(1);
    // Scrollbar track starts at TimelineViewport.left.
    expect(before.barHidden).toBe(false);
    expect(Math.abs(before.bar.left - before.owner.left)).toBeLessThanOrEqual(1);
    expect(before.bar.right).toBeLessThanOrEqual(before.view.right + 1);
    // Driving the track scrolls the Timeline owner; fixed labels X and row Y/height stay within 1px.
    await bar.evaluate((element) => { element.scrollLeft = 120; });
    await expect.poll(() => page.locator("[data-role='timeline-viewport']").evaluate((element) => element.scrollLeft)).toBe(120);
    const after = await measure();
    expect(Math.abs(after.frozen.left - before.frozen.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.left.left - before.left.left)).toBeLessThanOrEqual(1);
    before.rows.forEach((row, index) => { expect(Math.abs(after.rows[index]![0]! - row[0]!)).toBeLessThanOrEqual(1); expect(Math.abs(after.rows[index]![1]! - row[1]!)).toBeLessThanOrEqual(1); });
    // Scrolling the owner moves the ruler with it (timeline-local X).
    expect(Math.abs((before.ruler.left - after.ruler.left) - 0)).toBeLessThanOrEqual(1);
  });
}
