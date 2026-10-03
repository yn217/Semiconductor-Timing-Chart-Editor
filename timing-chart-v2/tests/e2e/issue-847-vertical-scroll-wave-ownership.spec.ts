import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

for (const viewportSize of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  for (const bottomVisible of [true, false]) test(`rapid vertical scroll keeps visible showcase rows paired with rendered waveform owners at ${viewportSize.width}x${viewportSize.height}, Bottom ${bottomVisible ? "open" : "closed"}`, async ({ page }) => {
    await page.setViewportSize(viewportSize);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json"));
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await page.getByRole("tab", { name: "Annotation", exact: true }).click();
    const selectedAnnotationRow = page.locator("[data-annotation-row='a.text']");
    await expect(selectedAnnotationRow).toBeVisible();
    await selectedAnnotationRow.click();
    await expect(selectedAnnotationRow).toHaveAttribute("data-selected", "true");
    if (!bottomVisible) {
      await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
      await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-visible", "false");
    }
    const viewport = page.getByTestId("cycle-viewport");
    await expect.poll(() => viewport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect.poll(() => viewport.evaluate((viewportElement) => {
      const state = viewportElement.ownerDocument.querySelector("[data-testid='cycle-surface']");
      if (!state) return false;
      const viewportRect = viewportElement.getBoundingClientRect();
      const rows = [...state.querySelectorAll<HTMLElement>("[data-role='timing-row'][data-kind='timing']")]
        .filter((row) => { const rect = row.getBoundingClientRect(); return rect.bottom > viewportRect.top && rect.top < viewportRect.bottom; });
      return rows.length > 0 && rows.every((row) => {
        const id = row.dataset.rowId;
        const owner = id ? state.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(id)}']`) : null;
        return owner !== null && (owner.querySelector("svg, canvas[data-wave-canvas]") !== null || owner.hasAttribute("data-wave-error"));
      });
    })).toBe(true);

    await page.evaluate(() => {
      type ScrollSample = { scrollTop: number; renderer: Record<string, number>; missing: Array<{ id: string; ownerPresent: boolean; hasWave: boolean; waveError: boolean; waveState?: string; waveRenderer?: string; waveErrorText?: string; batchId?: string; renderedStart?: string; renderedEnd?: string; rowTop?: number; ownerTop?: number }>; misaligned: Array<{ id: string; rowY: number; waveY: number }> };
      const root = document.querySelector<HTMLElement>("[data-testid='cycle-surface']")!;
      const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
      const target = window as typeof window & { __issue847Samples?: ScrollSample[]; __issue847Stop?: boolean };
      target.__issue847Samples = [];
      target.__issue847Stop = false;
      const sample = () => {
        if (target.__issue847Stop) return;
        const bounds = viewport.getBoundingClientRect();
        const rows = [...root.querySelectorAll<HTMLElement>("[data-role='timing-row'][data-kind='timing']")]
          .filter((row) => { const rect = row.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom; });
        const missing: ScrollSample["missing"] = [];
        const misaligned: Array<{ id: string; rowY: number; waveY: number }> = [];
        const renderer = JSON.parse(root.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.dataset.performanceCounters ?? "{}") as Record<string, number>;
        for (const row of rows) {
          const id = row.dataset.rowId ?? "<missing-id>";
          const owner = root.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(id)}']`);
          if (!owner || (!owner.querySelector("svg, canvas[data-wave-canvas]") && !owner.hasAttribute("data-wave-error"))) missing.push({ id, ownerPresent: owner !== null, hasWave: owner?.querySelector("svg, canvas[data-wave-canvas]") !== null, waveError: owner?.hasAttribute("data-wave-error") ?? false, ...(owner?.dataset.waveState ? { waveState: owner.dataset.waveState } : {}), ...(owner?.dataset.waveRenderer ? { waveRenderer: owner.dataset.waveRenderer } : {}), ...(owner?.dataset.waveError ? { waveErrorText: owner.dataset.waveError } : {}), ...(owner?.dataset.waveBatchId ? { batchId: owner.dataset.waveBatchId } : {}), ...(owner?.dataset.renderedSourceWindowStart ? { renderedStart: owner.dataset.renderedSourceWindowStart } : {}), ...(owner?.dataset.renderedSourceWindowEnd ? { renderedEnd: owner.dataset.renderedSourceWindowEnd } : {}), rowTop: row.getBoundingClientRect().top, ...(owner ? { ownerTop: owner.getBoundingClientRect().top } : {}) });
          if (owner && Math.abs(owner.getBoundingClientRect().top - row.getBoundingClientRect().top) > 1) misaligned.push({ id, rowY: row.getBoundingClientRect().top, waveY: owner.getBoundingClientRect().top });
        }
        target.__issue847Samples!.push({ scrollTop: viewport.scrollTop, renderer, missing, misaligned });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    const beforeRevision = await host.getAttribute("data-canonical-revision");
    const beforeHistory = await page.getByTestId("history-status").textContent();
    const beforeDirty = await page.getByTestId("dirty-status").textContent();
    const scrollExtent = await viewport.evaluate((element) => ({ max: element.scrollHeight - element.clientHeight, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    expect(scrollExtent.max).toBeGreaterThan(0);
    // Drive the production vertical scroll owner directly. The Bottom resize
    // track can intercept wheel coordinates at 1280x720; scrollTop still
    // emits the real owner event that refreshes row/wave virtualization.
    const scrollPositions = [0, 520, 1040, scrollExtent.max, Math.max(0, scrollExtent.max - 520), 514, 0].map((top) => Math.min(scrollExtent.max, top));
    for (const top of scrollPositions) {
      await viewport.evaluate((element, nextTop) => element.scrollTo({ top: nextTop, behavior: "instant" }), top);
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(top);
      await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
    }
    await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
    const samples = await page.evaluate(() => {
      type ScrollSample = { scrollTop: number; renderer: Record<string, number>; missing: Array<{ id: string; ownerPresent: boolean; hasWave: boolean; waveError: boolean }>; misaligned: Array<{ id: string; rowY: number; waveY: number }> };
      const target = window as typeof window & { __issue847Samples?: ScrollSample[]; __issue847Stop?: boolean };
      target.__issue847Stop = true;
      return target.__issue847Samples ?? [];
    });
    expect(samples.length).toBeGreaterThan(0);
    const missingStreak = new Map<string, { current: number; max: number; firstScrollTop: number }>();
    const misalignedStreak = new Map<string, { current: number; max: number; firstScrollTop: number; sample?: { rowY: number; waveY: number } }>();
    for (const sample of samples) {
      const missingIds = new Set(sample.missing.map(({ id }) => id));
      const misalignedIds = new Set(sample.misaligned.map(({ id }) => id));
      for (const [id, entry] of missingStreak) { entry.current = missingIds.has(id) ? entry.current + 1 : 0; entry.max = Math.max(entry.max, entry.current); }
      for (const { id } of sample.missing) if (!missingStreak.has(id)) missingStreak.set(id, { current: 1, max: 1, firstScrollTop: sample.scrollTop });
      for (const [id, entry] of misalignedStreak) { entry.current = misalignedIds.has(id) ? entry.current + 1 : 0; entry.max = Math.max(entry.max, entry.current); }
      for (const mismatch of sample.misaligned) if (!misalignedStreak.has(mismatch.id)) misalignedStreak.set(mismatch.id, { current: 1, max: 1, firstScrollTop: sample.scrollTop, sample: mismatch });
    }
    const sustainedMissing = [...missingStreak].filter(([, entry]) => entry.max > 1).map(([id, entry]) => {
      const sample = samples.find((item) => item.missing.some((missing) => missing.id === id));
      return { id, ...entry, sample: sample ? { scrollTop: sample.scrollTop, renderer: sample.renderer, owner: sample.missing.find((missing) => missing.id === id) } : undefined };
    });
    const sustainedMisalignment = [...misalignedStreak].filter(([, entry]) => entry.max > 1).map(([id, entry]) => ({ id, ...entry }));
    const missingSummary = sustainedMissing.slice(0, 6).map(({ id, max, firstScrollTop, sample }) => ({ id, max, firstScrollTop, renderer: sample?.renderer, owner: sample?.owner }));
    const missingTimeline = samples.flatMap((sample, frameIndex) => sample.missing.length === 0 ? [] : [{ frameIndex, scrollTop: sample.scrollTop, renderer: sample.renderer, missing: sample.missing }]);
    console.info("#847 vertical-scroll frame evidence", { viewportSize, scrollPositions: [...new Set(samples.map((sample) => sample.scrollTop))], missingFrames: samples.filter((sample) => sample.missing.length > 0).length, sustainedMissingCount: sustainedMissing.length, sustainedMissing: missingSummary, missingTimeline, sustainedMisalignment });
    expect(sustainedMissing, JSON.stringify({ viewportSize, scrollPositions: [...new Set(samples.map((sample) => sample.scrollTop))], sustainedMissingCount: sustainedMissing.length, sustainedMissing: missingSummary, missingTimeline })).toEqual([]);
    expect(sustainedMisalignment, JSON.stringify({ viewportSize, scrollPositions: [...new Set(samples.map((sample) => sample.scrollTop))], sustainedMisalignment })).toEqual([]);
    await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
    await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
    await expect(page.getByTestId("dirty-status")).toHaveText(beforeDirty!);
    if (!bottomVisible) {
      await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
      await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-visible", "true");
      await page.getByRole("tab", { name: "Annotation", exact: true }).click();
    }
    await expect(selectedAnnotationRow).toHaveAttribute("data-selected", "true");
  });
}
