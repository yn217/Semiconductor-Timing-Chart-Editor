import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { startInCycleMode } from "./cycle-startup.js";
import { documentState, expectViewOnly } from "./view-only.js";

startInCycleMode(test);

const showcase = resolve("samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json");

for (const bottomVisible of [true, false]) {
  test(`Cycle -> Transaction -> Cycle rebuilds waveform prefetch at unchanged viewport (Bottom ${bottomVisible ? "open" : "closed"})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(showcase);
    await expect(host).toHaveAttribute("data-editor-idle", "true");

    if (!bottomVisible) {
      await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
      await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-visible", "false");
    }

    const surface = page.locator("[data-role='timing-chart-surface']");
    const counters = async () => surface.evaluate((element) => JSON.parse((element as HTMLElement).dataset.performanceCounters ?? "{}") as { wavePrefetchOwnerCount: number; wavePrefetchRequestedCount: number });
    await expect.poll(async () => (await counters()).wavePrefetchOwnerCount).toBeGreaterThan(0);
    await expect.poll(async () => (await counters()).wavePrefetchRequestedCount).toBeGreaterThan(0);
    const before = {
      ...(await documentState(page)),
      requested: (await counters()).wavePrefetchRequestedCount,
      planOwners: (await counters()).wavePrefetchOwnerCount,
      scrollTop: await page.getByTestId("cycle-viewport").evaluate((element) => element.scrollTop),
    };

    const mode = page.locator(".view-mode");
    await mode.getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-view-mode", "Transaction");
    await expect.poll(async () => (await counters()).wavePrefetchOwnerCount).toBe(0);
    await mode.getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-view-mode", "Cycle");
    await expect.poll(async () => (await counters()).wavePrefetchOwnerCount).toBeGreaterThan(0);
    await expect.poll(async () => (await counters()).wavePrefetchRequestedCount).toBeGreaterThan(before.requested);
    const returned = await counters();
    console.info("#847 mode-roundtrip prefetch evidence", {
      bottomVisible,
      initialPlanOwners: before.planOwners,
      requestedBefore: before.requested,
      requestedAfter: returned.wavePrefetchRequestedCount,
      rebuiltPlanOwners: returned.wavePrefetchOwnerCount,
    });

    await expectViewOnly(page, { revision: before.revision, history: before.history, dirty: before.dirty });
    const viewport = page.getByTestId("cycle-viewport");
    expect(await viewport.evaluate((element) => element.scrollTop)).toBe(before.scrollTop);
    const mountedOwners = await surface.locator("[data-role='wave-owner']:has(svg), [data-role='wave-owner']:has(canvas[data-wave-canvas])").count();
    expect(mountedOwners).toBeLessThan(48);

    const maxScrollTop = await viewport.evaluate((element) => element.scrollHeight - element.clientHeight);
    const jumpTop = Math.min(520, maxScrollTop);
    expect(jumpTop).toBeGreaterThan(0);
    await viewport.evaluate((element, top) => element.scrollTo({ top, behavior: "instant" }), jumpTop);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(jumpTop);
    await expect.poll(() => viewport.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const root = element.ownerDocument.querySelector<HTMLElement>("[data-testid='cycle-surface']");
      if (!root) return false;
      const visible = [...root.querySelectorAll<HTMLElement>("[data-role='timing-row'][data-kind='timing']")]
        .filter((row) => { const rect = row.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom; });
      return visible.length > 0 && visible.every((row) => {
        const id = row.dataset.rowId;
        const owner = id ? root.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(id)}']`) : null;
        return owner !== null && (owner.querySelector("svg, canvas[data-wave-canvas]") !== null || owner.hasAttribute("data-wave-error"));
      });
    })).toBe(true);
    await expectViewOnly(page, { revision: before.revision, history: before.history, dirty: before.dirty });
  });
}
