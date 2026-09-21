import { expect, test, type Page } from "@playwright/test";

// #764: Transaction Group header labels are a sticky context layer: during real native horizontal scrollbar drags they stay pinned at the
// Timeline viewport's left edge (never half-cut), deterministically left -> mid -> far right -> back, and stay pinned after collapse/expand.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const geometry = (page: Page) => page.evaluate(() => {
  const view = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
  const vr = view.getBoundingClientRect();
  const contexts = Array.from(document.querySelectorAll<HTMLElement>(".transaction-group-header-context")).map((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
    const visibleY = r.top >= vr.top && r.bottom <= vr.top + view.clientHeight;
    return { left: r.left - vr.left, right: r.right - vr.left, hitInside: !visibleY || (hit !== null && el.contains(hit)), label: (el.textContent ?? "").trim().slice(0, 24) };
  });
  return { scrollLeft: view.scrollLeft, scrollWidth: view.scrollWidth, clientWidth: view.clientWidth, viewLeft: vr.left, viewRight: vr.right, viewBottom: vr.bottom, barH: view.offsetHeight - view.clientHeight, contexts };
});
const canon = (page: Page) => page.evaluate(() => [document.querySelector("[data-testid='revision-status']")?.textContent, document.querySelector("[data-testid='history-status']")?.textContent, document.querySelector("[data-testid='dirty-status']")?.textContent]);

for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Group header labels stay pinned during native scrollbar drag at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.locator(".transaction-group-header-context").first()).toBeVisible();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption("400");
    await expect.poll(async () => { const g = await geometry(page); return g.scrollWidth - g.clientWidth; }).toBeGreaterThan(300);
    const before = await canon(page);
    const start = await geometry(page);
    test.skip(start.barH === 0, "needs a classic scrollbar");
    expect(start.contexts.length).toBeGreaterThan(0);
    // Resting state: the label sits at the natural left inset.
    const restingLeft = start.contexts.map((c) => c.left);
    const trackLeft = start.viewLeft; const trackLen = start.clientWidth; const ARROW = 17; const y = start.viewBottom - 8;
    const thumb = () => geometry(page).then((g) => { const track = trackLen - 2 * ARROW; const width = Math.max(20, (g.clientWidth / g.scrollWidth) * track); const left = trackLeft + ARROW + (g.scrollLeft / (g.scrollWidth - g.clientWidth)) * (track - width); return { x: left + width / 2, track, width }; });
    const dragTo = async (fraction: number) => {
      const t = await thumb();
      const target = trackLeft + ARROW + t.width / 2 + fraction * (t.track - t.width);
      await page.mouse.move(t.x, y); await page.mouse.down();
      for (let step = 1; step <= 8; step += 1) await page.mouse.move(t.x + ((target - t.x) * step) / 8, y);
      await page.mouse.up();
    };
    const expectPinned = async (label: string, scrolled: boolean) => {
      const g = await geometry(page);
      for (const c of g.contexts) {
        // Wholly inside the viewport horizontally (no half-cut label), and its hit target belongs to the header.
        expect(c.left, `${label} ${c.label} left`).toBeGreaterThanOrEqual(-1);
        expect(c.right, `${label} ${c.label} right`).toBeLessThanOrEqual(g.viewRight - g.viewLeft + 1);
        expect(c.hitInside, `${label} ${c.label} hit target`).toBe(true);
        if (scrolled) expect(c.left, `${label} ${c.label} pinned`).toBeLessThanOrEqual(1);
      }
      return g;
    };
    await dragTo(0.5); const mid = await expectPinned("mid", true);
    expect(mid.scrollLeft).toBeGreaterThan(50);
    await dragTo(1); const far = await expectPinned("far-right", true);
    expect(far.scrollLeft).toBeGreaterThan(mid.scrollLeft);
    await dragTo(0); const back = await expectPinned("back", false);
    expect(back.scrollLeft).toBeLessThanOrEqual(1);
    // Deterministic: returning to the origin restores the exact resting positions.
    back.contexts.forEach((c, i) => expect(Math.abs(c.left - restingLeft[i]!)).toBeLessThanOrEqual(1));
    // Collapse/expand keeps the same contract while scrolled.
    await dragTo(0.5);
    await page.locator(".transaction-group-header-chevron").first().click();
    await expectPinned("mid after collapse", true);
    await page.locator(".transaction-group-header-chevron").first().click();
    await expectPinned("mid after expand", true);
    expect(await canon(page)).toEqual(before);
  });
}
