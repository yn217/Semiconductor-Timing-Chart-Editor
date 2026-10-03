import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #175 (PR #1025 independent check): the Timeline horizontal scrollbar keeps following its scroll owner without re-installing its effect on
 * every render. After each layout-changing user action the bar must still be sized/positioned from the CURRENT owner: visible iff the owner
 * scrolls horizontally, bar width == owner client width, track width == owner scroll width, bar left == owner left.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

const geometry = (page: Page) => page.evaluate(() => {
  const bar = document.querySelector<HTMLElement>("[data-testid='timeline-hscroll']");
  if (!bar) return null; // not mounted (Combined, once the single-owner slice lands): nothing to follow
  const view = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
  const wrapper = document.querySelector<HTMLElement>(".editor-shell[data-view-mode='Cycle'] [data-role='timeline-viewport']");
  const owner = wrapper ?? view;
  const track = bar.firstElementChild as HTMLElement;
  return { hidden: bar.hidden, scrolls: owner.scrollWidth > owner.clientWidth, barWidth: bar.getBoundingClientRect().width, trackWidth: track.getBoundingClientRect().width, ownerClient: owner.clientWidth, ownerScroll: owner.scrollWidth, barLeft: bar.getBoundingClientRect().left, ownerLeft: owner.getBoundingClientRect().left, barScrollLeft: bar.scrollLeft, ownerScrollLeft: owner.scrollLeft };
});

async function expectFollowsOwner(page: Page, label: string): Promise<void> {
  await expect.poll(async () => {
    const g = await geometry(page);
    if (g === null) return "ok";
    if (g.hidden === g.scrolls) return `${label}: hidden=${g.hidden} but owner scrolls=${g.scrolls}`;
    if (g.hidden) return "ok";
    if (Math.abs(g.barWidth - g.ownerClient) > 2) return `${label}: bar width ${g.barWidth} vs owner client ${g.ownerClient}`;
    if (Math.abs(g.trackWidth - g.ownerScroll) > 2) return `${label}: track ${g.trackWidth} vs owner scroll ${g.ownerScroll}`;
    if (Math.abs(g.barLeft - g.ownerLeft) > 2) return `${label}: bar left ${g.barLeft} vs owner left ${g.ownerLeft}`;
    return "ok";
  }, { timeout: 8_000, message: label }).toBe("ok");
}

for (const size of sizes) {
  test(`Timeline scrollbar follows its owner through panel, zoom, mode and document changes at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const open = async (cycles: number, signals: number, name: string) => {
      const document = generatePerformanceDocument({ signalCount: signals, cycleCount: cycles, profile: "standard" });
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", String(signals), { timeout: 60_000 });
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    };
    await open(600, 30, "a175.tcd");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expectFollowsOwner(page, "initial Cycle");

    const ribbon = page.getByTestId("ribbon");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    for (const panel of ["Inspector", "Bottom Editor", "Signal Tree"]) {
      const toggle = ribbon.getByRole("button", { name: panel, exact: true });
      if (await toggle.count() === 0) continue;
      await toggle.click(); await expectFollowsOwner(page, `${panel} off`);
      await toggle.click(); await expectFollowsOwner(page, `${panel} on`);
    }
    // Left pane resize drag.
    const resizer = page.getByTestId("left-pane-resizer");
    if (await resizer.count()) {
      const box = (await resizer.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 120);
      await page.mouse.down(); await page.mouse.move(box.x + 70, box.y + 120, { steps: 6 }); await page.mouse.up();
      await expectFollowsOwner(page, "left pane resized");
    }
    // Frozen (Role/Signal) column resize moves the time-domain origin.
    const frozen = page.getByTestId("frozen-pane-resizer");
    if (await frozen.count()) {
      const box = (await frozen.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 120);
      await page.mouse.down(); await page.mouse.move(box.x + 50, box.y + 120, { steps: 6 }); await page.mouse.up();
      await expectFollowsOwner(page, "frozen pane resized");
    }
    // Window resize.
    await page.setViewportSize({ width: size.width - 200, height: size.height });
    await expectFollowsOwner(page, "window narrower");
    await page.setViewportSize(size);
    await expectFollowsOwner(page, "window restored");
    // Zoom / Fit.
    await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click(); await expectFollowsOwner(page, "zoom in");
    await ribbon.getByRole("button", { name: "Zoom Out", exact: true }).click(); await expectFollowsOwner(page, "zoom out");
    const fit = ribbon.getByRole("button", { name: /Fit All/ }).first();
    if (await fit.count()) { await fit.click(); await expectFollowsOwner(page, "fit all"); }
    // Mode switches change the scroll owner (Cycle wrapper vs shared viewport).
    for (const mode of ["Transaction", "Combined", "Cycle"] as const) {
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
      // Combined has two horizontal owners until #573 lands, so the single-owner oracle only applies to Cycle/Transaction.
      if (mode !== "Combined") await expectFollowsOwner(page, `mode ${mode}`);
    }
    // A different document: the owner's content size changes with no user layout action on the bar.
    await open(3000, 20, "b175.tcd");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expectFollowsOwner(page, "replaced long document");
    await open(40, 10, "c175.tcd");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expectFollowsOwner(page, "replaced short document");
  });
}
