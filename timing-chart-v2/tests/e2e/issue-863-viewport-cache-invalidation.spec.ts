import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #863 (PR #1011 independent verification): the viewport-projection reuse during scroll must not leave stale Annotation presentation.
 * Probes invalidation by observable result: owner X vs the Ruler tick of its source cycle (so a stale/old-geometry projection shows as
 * drift), deleted Annotations never resurrect on later scrolls, a replaced document never shows old owners, folds keep alignment, and a
 * 100k-cycle far re-window shows only correct, bounded owners.
 */
const idCycle = (id: string) => Number(id.split("_").at(-1));

async function drift(page: Page, fit = false): Promise<{ compared: number; worst: number; mounted: number }> {
  return page.evaluate((useFit) => {
    const ticks = [...document.querySelectorAll<HTMLElement>(".cycle-ruler .cycle-tick[data-source-cycle]")].map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left })).sort((a, b) => a.cycle - b.cycle);
    const owners = [...document.querySelectorAll<HTMLElement>("[data-role='annotation-owner'][data-annotation-id^='ann_p_']")];
    let compared = 0; let worst = 0;
    for (const owner of owners) {
      const cycle = Number(owner.dataset.annotationId!.split("_").at(-1));
      const exact = ticks.find((candidate) => candidate.cycle === cycle);
      const slope = ticks.length > 1 ? (ticks.at(-1)!.x - ticks[0]!.x) / (ticks.at(-1)!.cycle - ticks[0]!.cycle) : 0;
      const tick = exact ?? (useFit && ticks.length > 1 ? { cycle, x: ticks[0]!.x + (cycle - ticks[0]!.cycle) * slope } : undefined);
      const body = owner.querySelector<HTMLElement>("[data-role='annotation-body']");
      if (!tick || !body) continue;
      const box = body.getBoundingClientRect();
      if (box.right < 0 || box.left > window.innerWidth) continue;
      compared += 1; worst = Math.max(worst, Math.abs(box.left + box.width / 2 - tick.x));
    }
    return { compared, worst, mounted: owners.length };
  }, fit);
}

async function openDocument(page: Page, document: unknown, name = "p863.tcd"): Promise<void> {
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", /\d+/);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
}

const makeDocument = (cycleCount: number, spacing: number, extra: Record<string, unknown> = {}, prefix = "ann_p") => {
  const base = generatePerformanceDocument({ signalCount: 40, cycleCount, profile: "standard" });
  const annotations = Array.from({ length: Math.floor(cycleCount / spacing) }, (_, index) => ({ id: `${prefix}_${index * spacing}`, type: "verticalLine", label: `A${index * spacing}`, visible: true, anchor: { signalId: base.signals[1 + (index % 20)]!.id, cycle: index * spacing, point: "cycle-start" } }));
  return { ...base, annotations, ...extra };
};

for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`scroll / zoom / Fit / delete / undo / replace keep Annotation owners correct at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await openDocument(page, makeDocument(1000, 5));
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect.poll(() => page.locator("[data-role='annotation-owner']").count(), { timeout: 60_000 }).toBeGreaterThan(0);
    const owner = page.locator("[data-role='timeline-viewport']");
    const state = () => page.evaluate(() => ({ revision: document.querySelector("[data-testid='cycle-surface']")?.getAttribute("data-canonical-revision"), history: document.querySelector("[data-testid='history-status']")?.textContent, dirty: document.querySelector("[data-testid='dirty-status']")?.textContent }));
    const baseline = await state();
    const failures: string[] = [];
    let totalCompared = 0; let skipped = 0;
    const check = async (label: string) => {
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await page.waitForTimeout(250);
      const result = await drift(page, true);
      totalCompared += result.compared;
      if (result.compared === 0) skipped += 1;
      if (result.worst > 2) failures.push(`${label}: owner off its ruler tick by ${result.worst.toFixed(2)}px`);
      if (result.mounted > 400) failures.push(`${label}: ${result.mounted} mounted owners (unbounded)`);
    };

    await check("initial");
    for (let step = 1; step <= 6; step += 1) { await owner.evaluate((el, s) => { el.scrollLeft = s * 700; }, step); await check(`scroll ${step}`); }
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption("200");
    await check("zoom 200");
    for (let step = 1; step <= 3; step += 1) { await owner.evaluate((el, s) => { el.scrollLeft += s * 900; }, step); await check(`zoom200 scroll ${step}`); }
    await page.getByLabel("Zoom preset").selectOption("50");
    await check("zoom 50");
    await owner.evaluate((el) => { el.scrollLeft = Math.floor(el.scrollWidth / 3); });
    await check("zoom 50 scroll");
    await page.getByLabel("Zoom preset").selectOption("100");
    await check("zoom 100");
    // Vertical scroll must not strand owners either.
    await page.getByTestId("cycle-viewport").evaluate((el) => { el.scrollTop = 400; });
    await check("vertical scroll");
    await page.getByTestId("cycle-viewport").evaluate((el) => { el.scrollTop = 0; });
    await check("vertical back");

    // Delete a visible Annotation, scroll away and back: it must never resurrect from a reused projection; Undo brings it back.
    await owner.evaluate((el) => { el.scrollLeft = 0; });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    const selectedAt = await owner.evaluate((el) => el.scrollLeft);
    const first = surface.locator("[data-role='annotation-owner'][data-annotation-id^='ann_p_']").first();
    const targetId = (await first.getAttribute("data-annotation-id"))!;
    const target = surface.locator(`[data-role='annotation-owner'][data-annotation-id='${targetId}']`);
    const label = target.locator("[data-role='annotation-label']");
    await expect(label).toBeVisible();
    // Centre the label in the VISIBLE part of the viewport (the Bottom panel overlays its lower edge), as the #847 journey does.
    await label.evaluate(async (el) => { const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!; const box = el.getBoundingClientRect(); const view = viewport.getBoundingClientRect(); const bottom = document.querySelector<HTMLElement>(".bottom-resize-track")?.getBoundingClientRect().top ?? view.bottom; viewport.scrollTop += box.top - (view.top + (bottom - view.top) / 2); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    await page.waitForTimeout(400);
    const labelBox = (await label.boundingBox())!;
    const hit = { id: targetId, x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 };
    await page.mouse.click(hit!.x, hit!.y);
    await expect(target).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Delete");
    await expect(surface.locator(`[data-annotation-id='${targetId}']`)).toHaveCount(0);
    const afterDelete = await state();
    expect(afterDelete.history).not.toEqual(baseline.history);
    for (const left of [2500, 0, 1200, 0]) { await owner.evaluate((el, value) => { el.scrollLeft = value; }, left); await check(`after delete @${left}`); await expect(surface.locator(`[data-annotation-id='${targetId}']`), `deleted ${targetId} resurrected after scroll to ${left}`).toHaveCount(0); }
    await page.keyboard.press("Control+z");
    await owner.evaluate((el, value) => { el.scrollLeft = value; }, selectedAt);
    await expect(surface.locator(`[data-annotation-id='${targetId}']`)).toHaveCount(1);
    await check("after undo");

    // Replace the document: no owner of the old document may remain.
    await openDocument(page, makeDocument(400, 4, {}, "ann_q"), "q863.tcd");
    await expect.poll(() => page.locator("[data-annotation-id^='ann_q_']").count(), { timeout: 60_000 }).toBeGreaterThan(0);
    expect(await page.locator("[data-annotation-id^='ann_p_']").count(), "stale owners of the replaced document").toBe(0);
    await owner.evaluate((el) => { el.scrollLeft = 900; });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    expect(await page.locator("[data-annotation-id^='ann_p_']").count()).toBe(0);

    expect(totalCompared, "owners were really compared").toBeGreaterThan(50);
    expect(skipped, "most states compared at least one owner").toBeLessThan(8);
    expect(failures, failures.join("\n")).toEqual([]);
    void idCycle; void afterDelete;
  });

  test(`folded TimeGroup and 100k-cycle far re-window keep owners correct and bounded at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const fold = { timeGroups: [{ id: "tg_f863", name: "Fold", start: 12, end: 52, category: "collapsed", presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "40 cycles" } }] };
    await openDocument(page, makeDocument(600, 5, fold));
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect.poll(() => page.locator("[data-role='annotation-owner']").count(), { timeout: 60_000 }).toBeGreaterThan(0);
    const owner = page.locator("[data-role='timeline-viewport']");
    const failures: string[] = [];
    let compared = 0;
    for (const left of [0, 600, 1500, 0]) {
      await owner.evaluate((el, value) => { el.scrollLeft = value; }, left);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await page.waitForTimeout(250);
      const result = await drift(page);
      compared += result.compared;
      if (result.worst > 2) failures.push(`fold @${left}: off ruler by ${result.worst.toFixed(2)}px`);
    }
    expect(compared).toBeGreaterThan(10);

    await openDocument(page, makeDocument(100_000, 10), "far863.tcd");
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
    for (const fraction of [0.5, 0.97, 0.2, 0.999]) {
      await owner.evaluate(async (el, f) => { el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) * f); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }, fraction);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
      await expect.poll(async () => (await drift(page, true)).compared, { timeout: 30_000, message: `far re-window ${fraction}: owners missing` }).toBeGreaterThan(0);
      const result = await drift(page, true);
      if (result.worst > 2) failures.push(`far ${fraction}: off ruler by ${result.worst.toFixed(2)}px`);
      if (result.mounted > 400) failures.push(`far ${fraction}: ${result.mounted} mounted (unbounded)`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
